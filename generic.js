/**
 * Generic
 *
 * These are generic must-haves for the socket-tools library.
 *
 */
module.exports = function() {
	var stack = {};

	// ========================================================================
	// Ping/Pong
	// Yes, web sockets can do this itself, but it could "become useful".
	// ========================================================================

	/**
	 * Sends a ping message request
	 * @param  socket  client    Web socket
	 * @param  object  data      Message data
	 * @return void
	 */
	this.ping = function(client, data) {
		this.sendReq(client, 'ping');
	};

	/**
	 * Sends a pong message response
	 * @param  socket  client    Web socket
	 * @param  object  data      Message data
	 * @return void
	 */
	this.pong = function(client, data) {
		this.sendRes(client, data.id, null, 'pong');
	};

	// ========================================================================
	// Encode/Decode, RPC request/response formatters, send helpers, broadcast
	// ========================================================================
	this.encode = JSON.stringify,
	this.decode = JSON.parse,

	/**
	 * Creates a JSON RPC request object (not encoded).
	 *
	 * @param number  id       The id of the request
	 * @param string  method   The method name to invoke
	 * @param mixed   result   Result data
	 */
	this.RPCRequest = function(id, method, params) {
		if (typeof(method) !== 'string' || method == '') {
			throw new Error('Method must be a valid non-empty string');
		}

		return {
			id: id,
			method: method,
			params: params || [],
			date: Date.now(),
			jsonrpc: 2.0
		};
	};

	/**
	 * Creates a JSON RPC response object (not encoded).
	 *
	 * @param number id      The original id of the request
	 * @param mixed  error   A descriptive error message for errors
	 * @param mixed  result  Result data
	 */
	this.RPCResponse = function(id, error, result) {
		return {
			id: id,
			error: error || null,
			result: result || null,
			date: Date.now(),
			jsonrpc: 2.0
		};
	};

	/**
	 * Returns whether the object given is a valid RPC request
	 *
	 * @param  object  obj Data object
	 * @return boolean     Whether the RPC request is valid
	 */
	this.validRequest = function(obj) {
		var props = ['id', 'method', 'params', 'jsonrpc'];
		for (var i in props) {
			if (!obj.hasOwnProperty(props[i])) {
				return false;
			}
		}

		return (
			obj.jsonrpc == 2.0 && (
				typeof(obj.params) == 'object' &&
				obj.params.constructor.name == 'Array'
			)
		);
	};

	/**
	 * Returns whether the object given is a valid RPC response.
	 *
	 * @param  object  obj Data object
	 * @return boolean     Whether the RPC response is valid
	 */
	this.validResponse = function(obj) {
		var props = ['id', 'error', 'result', 'jsonrpc'];
		for (var i in props) {
			if (!obj.hasOwnProperty(props[i])) {
				return false;
			}
		}

		return obj.jsonrpc == 2.0;
	};

	/**
	 * Attempts to parse the data given and will only return valid RPC
	 * request or responseclient.
	 *
	 * @param  string data The raw message
	 * @return mixed       Data or null on error
	 */
	this.tryParse = function(data) {
		try { data = this.decode(data); } catch (e) {}

		return this.validRequest(data) || this.validResponse(data) ? data : null;
	};

	/**
	 * Send an RPC request with the method and any parameters required
	 *
	 * @param  ws     client      Web Socket/Client
	 * @param  string method      Method to execute
	 * @param  mixed  result      Result data to respond with
	 * @return void
	 */
	this.sendReq = function(client, method, data, callback) {
		if (client.props.messageID > (Number.MAX_SAFE_INTEGER - 1)) {
			// Reset back to 0 to prevent integer overflow
			client.props.messageID = 0;
		}

		if (typeof(data) === 'object' && data.constructor.name === 'Object') {
			data = [data];

			console.log('Data was wrapped into an object. Please re-consider use of:', data);
		}

		var msg = this.encode(this.RPCRequest(++client.props.messageID, method, data));

		this.debug('< (req)', msg);

		client.send(msg);

		if (typeof(callback) !== 'function') {
			callback = null;
		}

		if (!stack[client.props.id]) {
			stack[client.props.id] = {};
		}
		stack[client.props.id][client.props.messageID] = {
			method: method,
			callback: callback,
			created: Date.now(),
		}
	};

	/**
	 * Send an RPC response using the last ID from the original request
	 *
	 * @param  ws     client     Web Socket/Client
	 * @param  number id         ID of request message
	 * @param  string error      Errors to respond with
	 * @param  mixed  result     Result data to respond with
	 * @return void
	 */
	this.sendRes = function(client, id, error, result) {
		var msg = this.encode(this.RPCResponse(id, error, result));

		this.debug('< (res)', msg);

		client.send(msg);
	};

	/**
	 * Handles requests from clients.
	 * @param  object  event    Message Event
	 * @param  mixed  data      Request
	 * @return void
	 */
	this.handleReq = function(event, data) {

		if (typeof(data.method) !== 'string' || data.method == '') {
			throw new Error('Request method must be a valid non-empty string');
		}

		var response = this.tryMethod(event, data);

		if (response !== undefined) {
			this.sendRes(event.sender, response.id, response.error, response.result);
		}
	};

	/**
	 * Handles responses from clients
	 * @param  object  event    Message Event
	 * @param  mixed   data     Response
	 * @return void
	 */
	this.handleRes = function(event, data) {

		var client = event.sender;
		var props = client.props;

		if (!stack[props.id]) {
			stack[props.id] = {};
		}

		if (data.id && stack[props.id][data.id] !== null) {

			var origin = stack[props.id][data.id];

			if (typeof(origin.method) !== 'string' || origin.method == '') {
				throw new Error('Stack method must be a valid non-empty string');
			}

			var processTime = Date.now() - (origin.created || Date.now());
			if (processTime > 1500) {
				this.debug('(?) Method', origin.method, 'response callback took', processTime, 'Info:', origin, data);
			}

			if (data.result === 'keep-alive') {

				client.props.heartbeatPulse = true;

			} else if (origin.callback && typeof(origin.callback) === 'function') {

				stack[props.id][data.id].callback(event, data.error, data.result);

			} else if (origin.callback) {

				throw new Error('Invalid callback found in stack for stack method "' + origin.method + '"');

			}

			delete stack[props.id][data.id];

		} else if (data.id && !stack.hasOwnProperty(data.id)) {
			this.debug('(!) Unhandled message response', data);
		}
	};

	/**
	 * Sends an error to a client
	 *
	 * @param socket  client      Web socket
	 * @param mixed   data        Notification
	 * @return void
	 */
	this.sendError = function(client, errorCode, errorMessage) {

		var data = {
			error: errorMessage,
			code: errorCode
		};

		if (typeof(client) == 'string') {
			client = this.clients[client];
		}

		var msg = this.encode(this.RPCRequest(++client.props.messageID, 'alert', [data]));

		this.debug('<!', msg);

		client.send(this.encode(this.RPCRequest(++client.props.messageID, 'alert', [data])));
	};

	/**
	 * Sends a notification regardless of location
	 *
	 * @param  string  notificationCode        Notification code
	 * @param  string  notificationMessage     Notification message
	 * @param  mixed   data                    Extra data
	 * @return void
	 */
	this.sendNotificationAll = function(notificationCode, notificationMessage, data) {

		data = data || {};

		if (
			(typeof(data) == 'object' && data.constructor.name !== 'Object') ||
			typeof(data) !== 'object'
		) {
			data = {
				data: data
			};
		}

		data.code = notificationCode;
		data.message = notificationMessage;

		for (var i in this.clients) {
			var client = this.clients[i];

			this.sendReq(client, 'notify', [data]);
		}
	};

	/**
	 * Sends a notification to everyone in the lobby
	 *
	 * @param  string  notificationCode        Notification code
	 * @param  string  notificationMessage     Notification message
	 * @param  mixed   data                    Extra data
	 * @return void
	 */
	this.sendNotification = function(notificationCode, notificationMessage, data) {

		data = data || {};

		if (
			(typeof(data) == 'object' && data.constructor.name !== 'Object') ||
			typeof(data) !== 'object'
		) {
			data = {
				data: data
			};
		}

		data.code = notificationCode;
		data.message = notificationMessage;

		for (var i in this.clients) {
			var client = this.clients[i];

			if (!client.props.room) {
				this.sendReq(client, 'notify', [data]);
			}
		}
	};

	/**
	 * Send a message to the lobby
	 *
	 * @param  socket  client     Web socket
	 * @param  string  receiver   Client id
	 * @param  mixed   message    Message content
	 * @return void
	 */
	this.sendMessageToLobby = function(client, message) {

		if (!message || message === '') {
			throw new Error('Message cannot be blank');
		}

		var msg = {
			content: message,
			from: client.props.id,
			date: Date.now(),
			for: null,
			type: 'lobby'
		};

		for (var i in this.clients) {
			var iclient = this.clients[i];

			if (!iclient.props.room) {
				this.sendReq(iclient, 'message', [msg]);
			}
		}
	};

	/**
	 * Broadcasts messages to other clients defined in the parameterclient.
	 *
	 * The messages sent are raw, in order to make it as fast as possible.
	 * You can have an excluded client or list of excluded clients as part
	 * of a blacklist, but what's faster is to only include the clients you
	 * need.
	 *
	 * Due to this it means that messages will not be able to update their RPC
	 * id per request, and also would take took much time to decode/re-encode
	 * each message. Clients may also need to relax the need to check for IDs?
	 *
	 * You can optionally close the clients afterwardclient.
	 *
	 * @param  string   message Message to be sent
	 * @param  array    clients Clients to receive messages
	 * @param  ws|array exclude Blacklisted clients without receiving messages
	 * @param  boolean  close   Optionally close the clients after messages sent
	 * @return void
	 */
	this.broadcast = function(message, clients, exclude, close) {
		if (!clients) return;

		this.debug('< (all)', message);

		for (var index in clients) {
			var client = clients[index];

			var send = (client !== exclude || exclude.indexOf && excluse.indexOf(client) !== -1);
			if (send && client.readyState === WebSocket.OPEN) {
				client.send(message);
				if (close) {
					client.close();
				}
			}
		}
	};

};