module.exports = function() {

	// ========================================================================
	// Clients
	// ========================================================================

	var _heartbeat;

	if (this.clients) {
		if (!(
			typeof(this.clients) == 'object' &&
			this.clients.constructor.name === 'object'
		)) {
			this.clients = 0;
		}
	}

	this.clients = this.clients || {};

	/**
	 * This is the heartbeat loop for checking the pulses of clients (activity).
	 * This can help remove individuals using the web socket for too long by
	 * itself.
	 */
	var heartbeatLoop = function() {
		for(var id in this.clients) {
			var client = this.clients[id];

			if (!client.props.heartbeat) continue;

			if (client.props.heartbeatPulse == false) {
				this.debug('(!) Unresponsive client:', this.encode(client.props));
				this.removeClient(client);
				client.emit('close', client); // Is this needed?
				client.terminate();
				return;
			}

			client.props.heartbeatPulse = false;

			this.sendReq(client, 'keep-alive?');
		}
	}.bind(this);


	/**
	 * Creates a heartbeat event system to prevent lost clients being stuck in
	 * memory.
	 *
	 * @param  socket    client    Web socket
	 * @param  number    timeout   Time between each heartbeat
	 * @param  function  cb        Callback - Remove in future?
	 * @return void
	 */
	this.addHeartbeat = function(client) {

		if (!this.clientExists(client)) throw new Error('Unknown client for heartbeat');

		if (!client || (client && client.props.heartbeat)) return;

		client.props.heartbeat = true;

		if (!_heartbeat) {
			// Setup heartbeat interval thread
			_heartbeat = setInterval(heartbeatLoop, 15000);
		}
	};

	/**
	 * Removes heartbeat event hook from a socket
	 *
	 * @param   client  Web socket
	 * @return void
	 */
	this.removeHeartbeat = function(client) {
		if (s && client.props && client.props.heartbeat) {
			client.props.heartbeat = false;
		}
	};

	// ========================================================================
	// Clients
	// ========================================================================

	this.getClient = function(client) {
		var result;

		if (
			typeof(client) === 'object' &&
			client.props &&
			client.props.id &&
			this.clients.hasOwnProperty(client.props.id)
		) {
			result = client;
		} else if (typeof(client) === 'string' && this.clients.hasOwnProperty(client)) {
			result = this.clients[client];
		}

		if (result) {
			result.props.data.lastActive = Date.now();
		}

		return result || false;
	};

	/**
	 * Returns boolean on whether the client is currently in the client list
	 * @param  socket    client    Web socket
	 * @return boolean
	 */
	this.clientExists = function(client) {
		return !!this.getClient(client);
	};

	/**
	 * Adds a client to the client list
	 * @param  socket    client    Web socket
	 * @return boolean
	 */
	this.addClient = function(client) {
		if (this.clientExists(client)) return;

		var id = this.createID('uuid4');
		client.props = {
			messageID: 0,
			id: id,
			room: null,
			roleStack: [],
			role: 'guest',
			relay: false,
			data: {
				name: this.createID('heroes'),
				connected: Date.now(),
				lastActive: Date.now()
			},
		};

		this.clients[id] = client;

		this.sendNotification(
			'user-join',
			'A user has joined the server',
			{user: {id: id, name: client.props.data.name}}
		);
	};

	/**
	 * Removes a client from the client list
	 * @param  socket  client  Web socket
	 * @return void
	 */
	this.removeClient = function(client) {

		client = this.getClient(client);

		if (!client) return;

		if (client.props.room) {
			this.sendRoomNotification(
				client.props.room,
				'room-leave',
				'A user left the server',
				{user: {id: client.props.name, name: client.props.data.name}}
			);
		} else {
			this.sendNotification(
				'user-leave',
				'A user has left the server',
				{user: {id: client.props.id, name: client.props.data.name}}
			);
		}


		this.clients[client.props.id] = null;

		delete this.clients[client.props.id];
	};

	/**
	 * Kicks the client from the server
	 * @param  socket  client  Web socket
	 * @return void
	 */
	this.kickClient = function(client, kick, reason) {

		client = this.getClient(client);

		if (!client) throw new Error('Unknown client');

		this.sendClientNotification(
			kick,
			'user-kick',
			'You were kicked from the server',
			{reason: reason || 'Unknown'}
		);

		kick.close();
		kick.terminate();

		this.sendNotificationAll(
			'user-kick',
			'A user was kicked from the server',
			{user: kick.props.data.name, reason: reason || 'Unknown'}
		);

		this.removeClient(kick);
	};

	/**
	 * Return a client list in the lobby
	 * @return mixed      Lobby client list
	 */
	this.getClientsInLobby = function() {
		var result = [];
		for (var i in this.clients) {
			var client = this.clients[i];

			if (client.props.room) continue;

			result.push({
				id: i,
				name: client.props.data.name
			});
		}

		return result;
	};

	this.getIdentity = function(client) {
		return {id: client.props.id, name: client.props.data.name};
	};

	/**
	 * Returns a client list in the lobby (safe)
	 * @return mixed      Lobby client list
	 */
	this.getClientList = this.getClientsInLobby;

	/**
	 * Returns the amount of clients connected
	 *
	 * @return number    Clients connected amount
	 */
	this.getClientCount = function() {
		return Object.keys(this.clients).length;
	};

	/**
	 * Retrieves data from current client
	 *
	 * @param  socket  client    Web socket
	 * @param  string  key  Data key
	 * @return mixed        Data value or null
	 */
	this.getClientData = function(client, key) {
		client = this.getClient(client);

		if (!client) return;

		var keys = (key ? key.split('.') : []);
		var temp = client.props.data;
		for (var i in keys) {
			var key = keys[i];
			if (!temp[key]) {
				return null;
			}
			temp = temp[key];
		}

		return temp;
	};

	/**
	 * Sets data for the current client
	 *
	 * @param socket client  Web socket
	 * @param string key     Data key
	 * @param mixed  value   Data value
	 */
	this.setClientData = function(client, key, value) {
		client = this.getClient(client);

		if (!client) return;

		var keys = (key ? key.split('.') : []);
		var temp = client.props.data;
		for (var i in keys) {
			var key = keys[i];

			if (i == keys.length - 1) {
				temp[key] = value;
			}

			if (!temp[key]) {
				temp[key] = [];
			}

			temp = temp[key];
		}
	};

	/**
	 * Change name of the client
	 * @param socket  client    Web socket
	 * @param mixed   string    New client name
	 * @return void
	 */
	this.changeClientName = function(client, name) {

		client = this.getClient(client);

		if (typeof(name) !== 'string') {
			throw new Error('Client name must be a string')
		}

		if (!client) return;

		client.props.data.name = name;

		var event = [
			'user-change',
			'A user changed their name',
			{user: {id: client.props.id, name: client.props.data.name}}
		];

		if (this.isClientInARoom(client)) {
			this.sendRoomNotification.apply(this, [client.props.room].concat(event));
		} else {
			this.sendNotification.apply(this, event);
		}

	};

	/**
	 * Send a message between clients
	 *
	 * @param  socket  client     Web socket
	 * @param  string  receiver   Client id
	 * @param  mixed   message    Message content
	 * @return void
	 */
	this.sendMessageToClient = function(client, receiver, message) {

		if (!message || message === '') {
			throw new Error('Message cannot be blank');
		}

		client = this.getClient(client);
		receiver = this.getClient(receiver);

		if (!client) return;

		if (receiver) {

			var msg = {
				content: message,
				from: client.props.id,
				date: Date.now(),
				for: receiver.props.id,
				type: 'user'
			};

			this.debug('Message from client {${client.props.id}} to client {${receiver}}: ' + this.encode(msg));

			this.sendReq(receiver, 'message', [msg]);
		} else {
			throw new Error('User does not exist');
		}
	};

	/**
	 * Sends a notification to a client
	 *
	 * @param socket  client      Web socket
	 * @param mixed   data        Notification
	 * @return void
	 */
	this.sendClientNotification = function(client, notificationCode, notificationMessage, data) {
		data = data || {};

		client = this.getClient(client);

		if (!client) return;

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

		this.sendReq(client, 'notify', [data]);
	};
}