"use strict";

// Web Socket client
var client = (new (function Client() {

	var ws = null;
	var messageID = 0;
	var stack = {};
	var thread;
	var scroller;
	var state = {
		typing: {
			others: {}
		},
		view: {type: 'lobby'}
	};
	var history = {};
	var inputTextBoxElement;
	var messagesElement;

	var refreshLists = function() {
		sendReq('list-users', null, function(event, error, users) {
			if (error) {
				console.error('Unable to list users:', error);
				return;
			}
			var usersList = document.querySelector('#users > ul');

			if (!Array.isArray(users)) {
				usersList.innerHTML = "<b>Unable to get users</b>";
				return;
			}

			// Remove any bugged users leaving whilst typing...
			var typing = Object.assign({}, state.typing.others);
			state.typing.others = {};

			for (var idx2 in users) {
				idx2 = users[idx2];
				if (typing.hasOwnProperty(idx2.id)) {
					state.typing.others[idx2.id] = idx2;
				}
			}
			refreshTyping();
			typing = null;

			if (users.length == 0) {
				// shouldn't happen...
				usersList.innerHTML = "<b>No users online</b>";
				return;
			}

			usersList.innerHTML = "";
			for (var idx in users) {
				var userItem = document.createElement('li');
				var user = users[idx];
				userItem.innerText = user.name;
				if (user.id == state.identity.id) {
					userItem.innerHTML = "<b>" + userItem.innerText + " (Me)</b>";
				}
				usersList.appendChild(userItem);
			}
		});
		sendReq('list-rooms', null, function(event, error, rooms) {
			if (error) {
				console.error('Unable to list rooms:', error);
				return;
			}

			var roomsList = document.querySelector('#rooms > ul');

			if (!Array.isArray(rooms)) {
				roomsList.innerHTML = "<b>Unable to get rooms</b>";
				return;
			}

			if (rooms.length == 0) {
				// shouldn't happen...
				roomsList.innerHTML = "<b>No rooms available</b>";
				return;
			}

			roomsList.innerHTML = "";
			for (var idx in rooms) {
				var roomItem = document.createElement('li');
				var room = rooms[idx];
				roomItem.innerText = room.name;
				// if (user.room.id == state.identity.room.id) {
				// 	userItem.innerHTML = "<b>" + roomItem.innerText + "</b>";
				// }
				roomsList.appendChild(roomItem);
			}
		});
	};

	var refreshViewScroll = function() {
		var scrollElement = messagesElement;
		refreshViewScroll.fullHeight = (scrollElement.scrollHeight - scrollElement.clientHeight);
		if (scrollElement.children.length > 1) {
			// Jump massive distances to prevent too much scrolling...
			scrollElement.scrollTop = (
				refreshViewScroll.fullHeight - (
					scrollElement.scrollHeight -
					scrollElement.children[scrollElement.childElementCount - 2].offsetTop
				)
			);
		}
		refreshViewScroll.distance = refreshViewScroll.fullHeight - scrollElement.scrollTop;
		if (scroller || refreshViewScroll.fullHeight == 0 || scrollElement.scrollTop >= refreshViewScroll.fullHeight) return;
		scroller = setInterval(function() {
			if (scrollElement.scrollTop >= fullHeight) {
				scroller = clearInterval(scroller);
				return;
			}
			refreshViewScroll.distance *= .2;
			refreshViewScroll.distance = Math.max(refreshViewScroll.distance, 10);
			scrollElement.scrollTop += refreshViewScroll.distance;
		}, 25);
	};

	var displayMessage = function(who, msg, date, publicity = true, from) {
		if (!history[state.view.type]) history[state.view.type] = [];
		// template
		// <div class="message">
		// 	<p>
		// 		<i class="datetime">12:30PM</i>
		// 		<span class="username">John</span>
		// 		<img src='hidden.svg' class='publicity'/>
		// 	</p>
		// 	<p class="content">Message here!</p>
		// </div>
		var message = document.createElement('div');
		message.classList.add('message');

		var headerContainer = document.createElement('p');
		var headerDateTime = document.createElement('i');
		headerDateTime.classList.add('datetime');
		var messageDate = new Date(date || Date.now());
		headerDateTime.innerText = (
			(messageDate.getHours() % 12).toString().padStart(2, ' ') + ':' +
			messageDate.getMinutes().toString().padStart(2, '0') +
			(messageDate.getHours() > 11 && messageDate.getHours() < 24 ? 'PM' : 'AM')
		);
		if (typeof(who) == 'object') {
			var headerUsername = document.createElement(who.element || 'span');
			headerUsername.classList.add('username');
			if (typeof(who.class) == 'string') {
				who.class.split(' ').forEach(function(idx) {headerUsername.classList.add(idx)});
			}
			if (typeof(who.style) == 'object') {
				Object.keys(who.style).forEach(function(idx) {headerUsername.style[idx] = who.style[idx]});
			}
			headerUsername.innerText = who.content;
		} else {
			var headerUsername = document.createElement('span');
			headerUsername.classList.add('username');
			headerUsername.innerText = who;
		}

		headerContainer.appendChild(headerDateTime);
		headerContainer.appendChild(headerUsername);

		if (from) {
			var headerFrom = document.createElement('i');
			headerFrom.innerText = ' < ' + from;
			headerContainer.appendChild(headerFrom);
		}

		if (!publicity) {
			var headerPublicity = document.createElement('img');
			headerPublicity.classList.add('publicity');
			headerPublicity.src = 'img/hidden.svg';
			headerPublicity.setAttribute('title', 'Only you can see this message');
			headerContainer.appendChild(headerPublicity);
		}

		var content;
		if (typeof(msg) == 'object') {
			content = document.createElement(msg.element || 'p');
			content.classList.add('content');
			if (typeof(msg.class) == 'string') {
				msg.class.split(' ').forEach(function(idx) {content.classList.add(idx)});
			}
			if (typeof(msg.style) == 'object') {
				Object.keys(msg.style).forEach(function(idx) {content.style[idx] = msg.style[idx]});
			}
			content.innerText = msg.content;
		} else {
			content = document.createElement('p');
			content.classList.add('content');
			content.innerText = msg;
		}

		message.appendChild(headerContainer);
		message.appendChild(content);

		messagesElement.appendChild(message);
		history[state.view.type].push(message.outerHTML);

		refreshViewScroll();
	};

	var displayNotification = function(msg) {
		if (!history[state.view.type]) history[state.view.type] = [];
		// template
		// <div class="message notification">
		// 		<p class="content">{notification}</p>
		// </div>
		var message = document.createElement('div');
		message.classList.add('message');
		message.classList.add('notification');

		var content = document.createElement('p');
		content.classList.add('content');
		content.innerText = msg;

		message.appendChild(content);

		messagesElement.appendChild(message);
		history[state.view.type].push(message.outerHTML);

		refreshViewScroll();
	};

	var refreshTyping = function() {
		var typingElement = document.querySelector('.view-window .user-input .writer-activity');
		typingElement.innerHTML = "";
		var length = Object.keys(state.typing.others).length;
		if (!length) {
			typingElement.innerText = '';
		} else if (length > 3) {
			typingElement.innerText = "3+ people typing...";
		} else {
			var i = 0;
			var list = '';
			for (var idx in state.typing.others) {
				var user = state.typing.others[idx];
				list += (++i > 1 ? (i == length ? ' and ' : ', ') : '') + user.name;
			}
			list += (length == 1 ? ' is ' : ' are ') + 'typing...';
			typingElement.innerText = list;
		}
	};

	var refreshIdentity = function(callback) {
		sendReq('identify', [], function(event, error, data) {
			if (error) throw new Error(error);
			console.log('Identity retrieved, I am ' + data.name);
			state.identity = data;

			if (state.view.type == 'room' && !data.room) {
				history[state.view.type] = null;
			}

			if (data.room) {
				state.view = data.room;
			} else {
				state.view = {type: 'lobby'};
			}
			refreshView();
			if (typeof(callback) == 'function') callback(data);
		});
	};

	var refreshView = function() {
		if (!history[state.view.type]) history[state.view.type] = [];

		messagesElement.innerHTML = history[state.view.type].join('\n');

		var viewWindowTitle = document.querySelector('.view-window #view-state');

		switch (state.view.type) {
			case 'lobby':
				viewWindowTitle.innerText = 'Lobby';
				document.querySelector('.sidebar #users h4').innerText = 'Users';
				document.querySelector('.sidebar #rooms').style.display = 'block';
				break;
			case 'room':
				viewWindowTitle.innerText = 'Room - ' + state.view.name;
				document.querySelector('.sidebar #users h4').innerText = 'Room Users';
				document.querySelector('.sidebar #rooms').style.display = 'none';
				break;
			// case 'user':
			// 	viewWindowTitle.innerText = state.view.name;
			// 	break;
			default:
				throw new Error('Unknown view state');
		}

		inputTextBoxElement.removeEventListener('keydown', onTextBoxKeyDown);
		inputTextBoxElement.removeEventListener('keyup', onTextBoxKeyUp);

		inputTextBoxElement.addEventListener('keydown', onTextBoxKeyDown);
		inputTextBoxElement.addEventListener('keyup', onTextBoxKeyUp);

		inputTextBoxElement.parentElement.onsubmit = function(e) {
			e.preventDefault
			return false;
		};
	};

	var onTextBoxKeyDown = function(e) {
		if (!state.typing) return;

		var modifiers = ['Meta', 'Alt', 'Shift', 'Control', 'Escape', 'Tab', 'CapsLock'];
		if (modifiers.indexOf(e.key) > -1) return;

		if (!state.typing.us) {
			state.typing.us = {
				last: Date.now(),
				timer: setInterval(function() {
					if (!(Date.now() - state.typing.us.last > 1e3)) return;
					sendReq('is-typing', [false]);
					clearInterval(state.typing.us.timer);
					state.typing.us = null;
				}, 1e3)
			};
			sendReq('is-typing', [true]);
		} else {
			state.typing.us.last = Date.now();
		}
	};

	var onTextBoxCommand = function(message) {
		/**
		 * Separates string based arguments to an array of arguments
		 * @param {string} str    String to args
		 * @param {string} separator     General format separator - a character
		 *                               only (e.g. comma, space)
		 */
		var parseArguments = function(str, separator) {

			if (typeof(str) !== 'string') throw new Error('String argument must be a string');
			if (!(typeof(separator) == 'string' && separator.length == 1)) {
				throw new Error('separator must be a valid char');
			}

			var args = [];
			var escape = separator;
			var buffer = '';
			var char;
			var len = str.length;

			for (var i = 0; i < len; ++i) {
				char = str[i];
				// Allow backslash escapes for quotes "\"Hello World\""
				if (char == escape && escape !== separator && str[i - 1] == '\\') {
					buffer += char;
					continue;
				}

				// Typical match, place in arguments
				if (char == escape) {
					args.push(buffer);
					buffer = '';
					escape = separator;
					continue;
				}

				if (escape == separator) {
					if (char == '"'  && (escape = char)) continue;
					if (char == '\'' && (escape = char)) continue;
				}
				buffer += str[i];
			}

			// We expect this to be reset after a match has been found
			if (escape != separator) {
				throw new Error("Unexpected end: " + str[str.length - 1]);
			}

			// Add left over string in buffer as last argument
			args.push(buffer);

			return args;
		};

		try {
			displayMessage({
				content: state.identity.name,
				style: {
					color: state.identity.color
				}
			}, message, null, false);
			message = parseArguments(message, ' '); // .split(' ');
			var action = message.shift().substring(1);
			switch (action) {
				case 'clear':
					history[state.view.type] = [];
					messagesElement.innerHTML = '';
					break;
				case 'msg':
					if (message.length < 2) {
						throw new Error('Private message must contain username and message');
					}
					var user = message.shift();
					message = {
						content: message.join(' '),
						date: Date.now()
					};
					sendReq('identify', [user], function(event, error, data) {
						if (error) {
							displayMessage(
								// TODO! finish this?
								"System",
								"Unable to send message to user: " + error,
								null,
								false
							);
						}
						message.for = data;
						sendReq('message', [message]);
					});
					break;
				case 'get-value':
				case 'set-value':
					// example: /set-value user.dataset {"test": ""}
					var key = message.shift();
					var value = message.join(' ');
					message.unshift(key);

					var parsed;

					try {
						parsed = value && JSON.stringify(JSON.parse(value));
					} catch (err) {}

					if (
						value[0] == '{' &&
						value[value.length - 1] == '}' &&
						parsed.replace(/\s+/g, '') == value.replace(/\s+/g, '')
					) {
						message = [key, JSON.parse(value)];
					}
					// intentionally no break here...
				case 'identify':
				case 'create-room':
				case 'join-room':
				case 'leave-room':
				case 'close-room':
				case 'leave':
				case 'kick':
				case 'set-role':
				case 'upgrade-role':
				case 'downgrade-role':
				case 'get-role':
				case 'get-roles':
				case 'set-owner':
					for (var idx in message) {
						var word = message[idx];
						if (typeof(word) !== 'string') continue;
						if (word == 'null') {
							word = null;
						} else if (word == 'false') {
							word = false;
						} else if (word == 'true') {
							word = true;
						} else if (word.match(/^[0-9]+$/)) {
							word = parseInt(word);
						} else if (word.match(/^([0-9]*\.[0-9]+)$/)) {
							word = parseFloat(word);
						}
						message[idx] = word;
					}
					sendReq(action, message, function(event, error, data) {
						if (error) {
							displayMessage("System", "Error:- " + error.toString(), null, false);
							return;
						}
						var result = data.toString();
						// result == null (===) typeof(result) == 'object'
						if (data == undefined || typeof(data) == 'object') {
							result = JSON.stringify(data, null, 4);
						}

						displayMessage("System", {
							element: 'pre',
							content: result,
							style: {
								background: 'rgba(0,0,0,0.5)',
								border: '1px solid black',
								padding: '.25em'
							}
						}, null, false);
					});
					break;
				case 'help':
					displayMessage(
						// TODO! finish this?
						"System",
						"No help available at this time...",
						null,
						false
					);
				default:
					throw new Error("This is not a registered command");
			}
		} catch (err) {
			displayMessage(
				"System",
				{
					style: {
						color: 'red'
					},
					content: err.message
				},
				null,
				false
			);
		}
	};

	var onTextBoxKeyUp = function(e) {
		if (e.code !== 'Enter') return;

		if (e.target.value.match(/(^[ \t]+$|^$)/g)) return;
		var message = e.target.value.replace(/^[ \t]+/, '');

		// Check command prefix
		if (message.indexOf('/') == 0) {
			onTextBoxCommand(message);
		} else {
			message = {
				content: message,
				date: Date.now()
			};
			message.for = state.view;
			sendReq('message', [message]);
		}

		e.target.value = "";
		e.target.focus();
	};

	var methods = {
		'relayed': function(event, data) {
			console.info('Received relayed information:', data.toString())
		},
		'ping': () => pong(),
		'notify': function(event, notification) {
			console.info('Received notification from server:', notification);
			if (notification.code == 'is-typing') {
				if (notification.data.typing) {
					if (!notification.data.user) return; // Invalid request
					state.typing.others[notification.data.user.id] = notification.data.user;
				} else {
					if (!notification.data.user) return; // Invalid request
					if (state.typing.others.hasOwnProperty(notification.data.user.id)) {
						delete state.typing.others[notification.data.user.id];
					}
				}
				refreshTyping();
				return;
			}

			notification.message = notification.message
			.replace('You have', notification.data.user.name + ' has')
			.replace('You', notification.data.user.name)
			.replace('A user', notification.data.user.name);

			if (
				["user-connected",
				"user-disconnected",
				"user-broken-connection",
				"user-join",
				"user-leave",
				"user-kick"].indexOf(notification.code) > -1
			) {
				refreshLists();
				if (notification !== "user-join" && notification.data.user) {
					delete state.typing.others[notification.data.user.id];
					refreshTyping();
				}
			}
			if (["room-join", "room-leave", "room-kick", "user-relocated"].indexOf(notification.code) > -1) {
				refreshLists();
				refreshIdentity(function(error, data) {
					displayNotification(notification.message.toString());
				});
				return;
			}
			displayNotification(notification.message.toString());
		},
		'message': function(event, message) {
			console.info('Received message from server:', message);
			var publicity = true;
			var who = {content: message.from.name, style: {color: message.from.color || null}};
			var from = null;
			if (message.for && message.for.type == 'user' && message.for.id !== message.from.id) {
				who = {content: message.for.name, style: {color: message.for.color}};
				from = message.from.name;
				publicity = false;
			}
			displayMessage(who, message.content.toString(), message.date, publicity, from);
		}
	};

	/**
	 * Creates a JSON RPC request object (not encoded).
	 *
	 * @param number  id       The id of the request
	 * @param string  method   The method name to invoke
	 * @param mixed   result   Result data
	 */
	var RPCRequest = function(id, method, params) {

		if (typeof(method) !== 'string' || method == '') {
			throw new Error('Method must be a valid non-empty string');
		}

		return {
			id: id,
			method: method,
			params: params || [],
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
	var RPCResponse = function(id, error, result) {
		return {
			id: id,
			error: error || null,
			result: result || null,
			jsonrpc: 2.0
		};
	};

	/**
	 * Returns whether the object given is a valid RPC request
	 *
	 * @param  object  obj Data object
	 * @return boolean     Whether the RPC request is valid
	 */
	var isValidRequest = function(obj) {
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
	var isValidResponse = function(obj) {
		var props = ['id', 'error', 'result', 'jsonrpc'];
		for (var i in props) {
			if (!obj.hasOwnProperty(props[i])) {
				return false;
			}
		}

		return obj.jsonrpc == 2.0;
	};

	/**
	 * Send an RPC request with the method and any parameters required
	 *
	 * @param  string     method    Method to execute
	 * @param  mixed      result    Result data to respond with
	 * @param  function   callback  Callback to send on RPC return
	 * @return void
	 */
	var sendReq = function(method, data, callback) {
		var msg = RPCRequest(++messageID, method, data);

		if (typeof(callback) !== 'function') {
			callback = null;
		}

		if (callback) stack[msg.id] = {
			method: method,
			callback: callback,
			time: Date.now()
		};

		console.info('< (req) ', msg);

		msg = JSON.stringify(msg);

		ws.send(msg);
	};

	/**
	 * Send an RPC response using the last ID used in the request
	 *
	 * @param  number id         ID of request message
	 * @param  string error      Errors to respond with
	 * @param  mixed  result     Result data to respond with
	 * @return void
	 */
	var sendRes = function(id, error, result) {
		var msg = RPCResponse(id, error, result);

		console.info('< (res) ', msg);

		msg = JSON.stringify(msg);

		ws.send(msg);
	};

	var handleReq = function(event, data) {

		if (typeof(data.method) !== 'string' || data.method == '') {
			throw new Error('Message method must be a valid non-empty string');
		}

		if (data.id > messageID) {
			messageID = data.id;
		}

		// This was a method request
		if (methods.hasOwnProperty(data.method)) {
			var params = [event].concat(data.params);
			methods[data.method].apply(this, params);
		}
	};

	var handleRes = function(event, data) {

		if (data.id && stack[data.id] !== null) {

			var origin = stack[data.id];

			if (!origin) {
				console.error("Unable to deal with unexpected response:", data);
				return;
			}

			if (typeof(origin.method) !== 'string' || origin.method == '') {
				throw new Error('Stack method must be a valid non-empty string');
			}

			if (typeof(origin.callback) !== 'function') {
				throw new Error('Invalid callback found in stack for stack method "' + origin.method + '"');
			}

			var processTime = Date.now() - (origin.created || Date.now())
			if (processTime > 1000) {
				console.info('Method', origin.method, 'response callback took', processTime, 'Info:', origin, data);
			}

			if (data.error && data.error.message) {
				data.error = new Error(data.error.message);
			}

			stack[data.id].callback(event, data.error, data.result);
			delete stack[data.id];
		} else if (data.id && !stack.hasOwnProperty(data.id)) {
			console.info(new Error('Unhandled message response'));
		}
	};

	/**
	 * Sends a ping message request
	 */
	var ping = function(event, data) {
		sendReq('ping');
	};

	/**
	 * Sends a pong message response
	 */
	var pong = function(event, data) {
		sendRes(event.data.id, null, 'pong');
	};

	/**
	 * Send back a heartbeat to keep the connection active.
	 * @return void
	 */
	var heartbeat = function(event, data) {
		sendReq('heartbeat');
	};

	// ========================================================================
	// Web Socket Instance
	// ========================================================================

	var createWSAddress = function(resource) {
		var protocol = location.protocol == 'https:' ? 'wss:' : 'ws:';
		var hostname = location.host.toString();
		return protocol + '//' + hostname + resource;
	};

	// Start client functionality.
	var start = function() {

		inputTextBoxElement = document.querySelector('.user-input form input.writer');
		messagesElement = document.querySelector('.view-window .messages');

		inputTextBoxElement.focus();

		ws = new WebSocket(createWSAddress('/endpoint'));

		ws.addEventListener('open', function() {
			// Do something when the socket opens
			console.log("Web socket has successfully connected!");
			refreshIdentity();
		});

		ws.addEventListener('close', function() {
			// Do something when the socket closes
			displayNotification('We were disconnected from the server, attempting to reconnect...');
			ws = null;
			console.log("Web socket was closed");
			clearInterval(thread);
			setTimeout(start, 2500);
		});

		ws.addEventListener('message', function(event) {
			if (event.data.slice(0, 7) === 'relayed') {
				// Pass relayed methods to a method, if it exists
				if (typeof(methods.relayed) == 'function') {
					methods.relayed(event, event.data.toString());
				}
				return;
			}

			var data = event.data.toString();

			try { data = JSON.parse(data); } catch (e) {}

			if (!(isValidRequest(data) || isValidResponse(data))) {
				console.error('Received unknown message:', event);
				return;
			}

			// Event sender args as our own
			var event = {
				id: data.id,
				sender: ws,
				data: data,
				origin: event,
				created: Date.now()
			};

			if (data.method) {
				console.info('> (req)', data);
				return handleReq(event, data);
			} else if (data) {
				console.info('> (res)', data);
				return handleRes(event, data);
			}
		});

		thread = setInterval(function() {
			// Cleanup/heartbeat every 10s
			heartbeat();
			for (var idx in stack) {
				if (Date.now() - stack[idx].time > 10e3) {
					// 10s+ return time? Feel free to disable but this can cause
					// a build up in the stack array. You have been warned!
					console.warn(
						`RPC function likely not returning, removing from stack:
						${JSON.stringify(stack[idx])}. If you are not expecting
						a reply, do not give sendRes a callback.
					`);
					delete stack[idx];
				}
			}
		}, 10e3);
	}

	document.onreadystatechange = function() {
		if (document.readyState !== 'complete') return;
		start();
	};

})());
