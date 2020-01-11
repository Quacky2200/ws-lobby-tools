module.exports = function() {
	// ========================================================================
	// Rooms
	// ========================================================================

	if (this.rooms) {
		if (!(
			typeof(this.rooms) == 'object' &&
			this.rooms.constructor.name === 'object'
		)) {
			this.rooms = 0;
		}
	}

	this.rooms = this.rooms || {};

	this.getRoom = function(room) {
		var result;

		if (typeof(room) === 'string' && this.rooms.hasOwnProperty(room)) {
			result = this.rooms[room];
		} else if (typeof(room) === 'object' && room.id && this.rooms.hasOwnProperty(room.id)) {
			result = room;
		}

		if (result) {
			room.lastActive = Date.now();
		}

		return result || false;
	};

	/**
	 * Returns boolean on whether room exists
	 * @param  string  room  Room id
	 * @return boolean       Whether room exists
	 */
	this.roomExists = function(room) {
		return this.getRoom(room) !== false;
	};

	/**
	 * Creates a room for clients to join. This will automatically move the
	 * owner into the room.
	 *
	 * @param  socket  client     Web socket
	 * @param  mixed   data  Room configuration
	 * @return void
	 */
	this.createRoom = function(client, data) {
		if (client.props.room) {
			this.sendClientNotification(
				client,
				'room-error',
				'Unable to create a room whilst you\'re currently in one!'
			);
			return;
		}

		var id = this.createID('uuid4');
		data = data || {};

		this.rooms[id] = {
			id: id,
			name: this.createID('phrase'),
			owner: client.props.id,
			relay: data.relay || false,
			created: Date.now(),
			lastActive: Date.now(),
			clients: []
		};

		this.sendClientNotification(
			client,
			'room-create',
			'A room has been created',
			{room: id}
		);

		if (!this.enterRoom(client, id)) {
			this.closeRoom(client, id, 'Creator could not join the room');
			return;
		}

		// Push the roles onto a stack for the owner
		client.props.roleStack.push(client.props.role);
		client.props.role = 'room.owner';
		client.props.room = id;
	};

	/**
	 * Returns room information
	 *
	 * @param  string  room  Room ID
	 * @return mixed         Room information
	 */
	this.getRoomInformation = function(room) {
		var result = this.getRoom(room);
		if (!result) {
			throw new Error('Room doesn\'t exist');
		}
		return result;
	};

	/**
	 * Enables and Disables relaying information between web sockets without
	 * validation. This is extremely useful for time critical applications but
	 * can be dangerous. Use at risk.
	 *
	 * @param  string  room   Room ID
	 * @return void
	 */
	this.toggleRoomRelay = function(client, room) {

		room = this.getRoom(room);

		if (!room) throw new Error('Room doesn\'t exist');

		if (client.props.room !== room.id) {
			throw new Error('You cannot toggle this room\'s relay preferences');
		}

		room.relay = !room.relay;
	};

	/**
	 * Changes the room name
	 *
	 * @param  string  room  Room ID
	 * @param  string  name  Personalised name
	 * @return void
	 */
	this.changeRoomName = function(room, name) {
		room = this.getRoom(room);

		if (!room) throw new Error('Room doesn\'t exist');

		room.name = name;

		this.sendRoomNotification(
			room,
			'room-change',
			'The room has been renamed',
			{room: {id: room.id, name: room.name}}
		);
	};

	/**
	 * Changes the ownership of a room to another, and must be made by the owner
	 * of the room.
	 *
	 * @param  socket  client     Web socket
	 * @param  string  newOwner   New owner (client ID)
	 * @return void
	 */
	this.changeRoomOwner = function(client, newOwner) {
		client = this.getClient(client);
		newOwner = this.getClient(newOwner);

		if (!this.isClientInARoom(client)) throw new Error('Owner must be in a room to perform this operation');

		var room = this.getRoom(client.props.room);

		if (!room) throw new Error('Room doesn\'t exist');

		if (!newOwner) {
			throw new Error('New owner is not a valid user');
		}

		if (!this.isClientInRoom(newOwner)) throw new Error('New owner must be an existing room member');

		var owner = room.owner;

		// Fallback to room member role
		client.props.role = client.props.roleStack.pop();

		room.owner = newOwner.props.id;
		newOwner.props.roleStack.push(newOwner.props.role);
		newOwner.props.role = roles.room.owner;

		this.sendClientNotification(
			newOwner,
			'room-change',
			'You are now the owner of this room',
			{room: room.id}
		);

		this.sendRoomNotification(
			room,
			'room-change',
			'The room owner has been changed',
			{room: {owner: newOwner.props.id}}
		);
	};

	/**
	 * Returns whether the client is the owner of a room.
	 *
	 * @param  socket  client  Web socket
	 * @param  string  room    Room id
	 * @return boolean         Room ownership
	 */
	this.isClientOwnerOfRoom = function(client, room) {
		room = getRoom(room);

		return room && room.owner == client.props.id;
	};

	/**
	 * Returns whether a client is in any kind of room.
	 *
	 * @param  socket  client  Web socket
	 * @return boolean
	 */
	this.isClientInARoom = function(client) {
		// This is a check, getRoom/getClient should not be checked
		return client.props.room && this.rooms.hasOwnProperty(client.props.room);
	};

	/**
	 * Returns whether a client is in a specific room
	 * @param  socket  client  Web socket
	 * @param  string  room    Room id
	 * @return boolean
	 */
	this.isClientInRoom = function(client, room) {
		// This is a check, getRoom/getClient should not be used
		return (
			typeof(room) == 'string' &&
			this.rooms.hasOwnProperty(room) &&
			client.props.room &&
			client.props.room === room &&
			this.rooms[room].client.indexOf(client.prop.id)
		);
	};

	/**
	 * Allows a player to join/enter a room. A user must leave a room before
	 * joining another.
	 *
	 * @param  socket  client  Web socket
	 * @param  string  id      Room id
	 * @return void
	 */
	this.enterRoom = function(client, room) {

		client = this.getClient(client);
		room = this.getRoom(room);

		if (!client || !room) return;

		if (client.props.room) throw new Error('You must leave a room first before joining another');

		if (!room.clients.indexOf(client.id)) {
			// Always add once just to make sure we're not added again
			room.clients.push(client.props.id);
		}

		client.props.room = room.id;

		// Move up roles
		client.props.roleStack.push(client.props.role);
		client.props.role = 'room.member';

		this.sendClientNotification(
			client,
			'room-join',
			'You have successfully joined the room',
			{room: {id: room.id, name: room.name}},
		);

		this.sendRoomNotification(
			room,
			'room-join',
			'A user has joined the room',
			{user: {id: client.props.id, name: client.props.data.name}}
		);

		return true;
	};

	/**
	 * Allows a player to leave a room. The user cannot leave a room if they
	 * are in the lobby.
	 * @param  socket  client  Web socket
	 * @param  string  id      Room id
	 * @return void
	 */
	this.leaveRoom = function(client, id) {
		if (!this.isClientInRoom(client, id)) return;

		if (this.isClientOwnerOfRoom(client, id)) return this.closeRoom(client, room);

		var room = this.rooms[id];

		var index = this.rooms[room].clients.indexOf(client.props.id);

		delete this.rooms[room].clients[index];
		client.props.room = null;

		// Rollback roles
		client.props.role = client.props.roleStack.pop();

		this.sendClientNotification(
			client.props.id,
			'room-leave',
			'You left the room',
		);

		this.sendRoomNotification(
			id,
			'room-leave',
			'A user has left the room',
			{user: client.props.id}
		);

		return true;
	};

	/**
	 * Closes a room.
	 *
	 * @param  ws      client    Web socket
	 * @param  string  room      Room
	 * @param  string  reason    Reason for room closure
	 * @return void
	 */
	this.closeRoom = function(client, room, reason) {
		client = this.getClient(client);

		if (!client) return;
		if (client.props.room) throw new Error('Only users in a room can close them');

		room = this.getRoom(room);

		if (client.props.room !== room.id) {
			throw new Error('Only users inside the room can close it');
		}

		this.shutdownRoom(room, reason || 'The room was gracefully closed');
	};

	// This should only be performed by an admin or server
	this.shutdownRoom = function(room, reason) {
		room = this.getRoom(room);

		if (!room) throw new Error('Room does not exist');

		for (var i in room.clients) {
			var id = room.clients[i];
			var client = clients[id];

			if (id == room.owner) {
				// Rollback owner role
				client.props.role = client.props.roleStack.pop();
			}

			if (clients[id].props.room === room.id) {
				clients[id].props.room = null;
				// Rollback roles
				client.props.role = client.props.roleStack.pop();
			}
		}

		delete room[room.id];

		this.sendNotification(
			'room-closed',
			'The room has been closed',
			{
				room: {id: room.id, name: room.name},
				reason: reason || 'The room was closed by the server'
			}
		);
	};

	/**
	 * Returns all rooms (unsafe)
	 * @return array    Rooms
	 */
	this.getRooms = function() {
		return this.rooms;
	};

	/**
	 * Returns a safe list for clients to find rooms.
	 * @return array    Room list with id and names
	 */
	this.getRoomList = function() {
		var result = [];
		for (var i in this.rooms) {
			result.push({
				id: i,
				name: this.rooms[i].name
			});
		}

		return result;
	};

	/**
	 * Gets count of rooms on the server
	 * @return   number  count of rooms
	 */
	this.getRoomCount = function() {
		return Object.keys(this.rooms).length;
	};

	/**
	 * Gets the number of clients in a room.
	 *
	 * This function is client ambigious.
	 *
	 * @param  string  room  Room id
	 * @return number        Number of clients in room
	 */
	this.getRoomClientCount = function(room) {
		room = this.getRoom(room);
		if (!room) return 0;

		// room.clients is an array
		return room.clients.length;
	};

	/**
	 * Return a safe list of clients in a specific room
	 * @return  mixed  List of clients in the room
	 */
	this.getClientsInRoom = function(room) {

		room = this.getRoom(room);
		if (!room) return;

		results = [];
		for (var i in room.clients) {
			var id = room.clients[i];

			if (this.clients.hasOwnProperty(id)) {
				result.push({
					id: id,
					name: this.clients[id].props.data.name
				});
			}
		}

		return result;
	};

	/**
	 * This function sends a notification to everyone in a specified room.
	 * @param  string  room                    Room id
	 * @param  string  notificationCode        Notification code
	 * @param  string  notificationMessage     Notification message
	 * @param  mixed   data                    Extra data
	 * @return void
	 */
	this.sendRoomNotification = function(room, notificationCode, notificationMessage, data) {

		room = this.getRoom(room);

		if (!room) return;

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

		for (var i in room.clients) {
			var id = room.clients[i];

			if (this.clients.hasOwnProperty(id)) {
				var client = this.clients[id];
				this.sendReq(client, 'notify', [data]);
			}
		}
	};

	/**
	 * Send a message between clients
	 *
	 * @param  socket  client     Web socket
	 * @param  string  room       Room id
	 * @param  mixed   message    Message content
	 * @return void
	 */
	this.sendMessageToRoom = function(client, room, message) {

		if (!message || message === '') {
			throw new Error('Message cannot be blank');
		}

		client = this.getClient(client);
		room = this.getRoom(room);
		if (!room) throw new Error('Room does not exist');

		var all = this.getClientsInRoom(room);

		var msg = {
			content: message,
			from: client.props.id,
			date: Date.now(),
			type: 'room',
			for: room
		};

		for (var i in room.clients) {
			var iclient = this.clients[i];

			if (iclient && iclient.props.room == room.id) {
				this.sendReq(iclient, 'message', [msg]);
			}
		}

	};

	/**
	 * Forcibly kicks a user out of a room.
	 *
	 * @param  socket  client    Web socket (the kicker)
	 * @param  socket  kick      Web socket (who to be kicked)
	 * @param  string  room      Room id
	 * @param  string  reason    Reason for kick
	 * @return void
	 */
	this.kickClientInRoom = function(client, kick, room, reason) {
		if (!client.props) return;

		if (!this.isClientInRoom(kick, room)) {
			throw new Error('You can only kick room users whilst in a room');
		}

		room = this.getRoom(room);
		if (!room) throw new Error('Room doesn\'t exist');

		// Make sure kicked client exists
		if (kick && typeof(kick) == 'string' && this.clients.hasOwnProperty(kick)) {
			kick = this.clients[kick];

			if (kick.props.room !== room.id) {
				throw new Error('You cannot kick someone outside of your own room');
			}
		} else {
			throw new Error('You cannot kick a user that doesn\'t exist');
		}

		this.sendClientNotification(
			kick,
			'room-kick',
			'You were kicked from the room',
			{
				room: {id: room.id, name: room.name},
				by: client.props.id,
				reason: reason || 'No reason was specified'
			}
		);

		var index = room.clients.indexOf(kick.props.id);
		if (index > -1) {
			delete this.rooms[room].clients[index];
		} /* else, kicked user left like a ninja or was a fraud! */

		kick.props.room = null;

		this.sendRoomNotification(
			room,
			'room-kick',
			'A user was kicked from the room',
			{
				room: room,
				user: kick.props.id,
				by: client.props.id,
				reason: reason || 'Unknown'
			}
		);
	};

};