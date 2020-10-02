/**
 *    ws-lobby-tools - A websocket and TCP lobby
 *    Copyright (C) 2020 Matthew James <Quacky2200@users.noreply.github.com>
 *
 *    This program is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU General Public License as published by
 *    the Free Software Foundation, either version 3 of the License, or
 *    (at your option) any later version.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU General Public License for more details.
 *
 *    You should have received a copy of the GNU General Public License
 *    along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const EventEmitter = require('events');
const Utils = require('./libs/utils');
const {Notification, Message} = require('./messages');

class Lobby {

	constructor() {
		this._emitter = new EventEmitter();
		this._events = {
			'user-connected': {
				local: 'You successfully connected to the server',
				broadcast: 'A user connected to the server',
				depth: 'lobby',
			},
			'user-disconnected': {
				local: 'You have disconnected from the server',
				broadcast: 'A user has disconnected from the server',
				depth: 'lobby',
			},
			'user-broken-connection': {
				// local: '',
				broadcast: 'A user unexpectedly disconnected from the server',
				depth: 'all',
			},
			'user-leave': {
				local: 'You left the server',
				broadcast: 'A user left the server',
				depth: 'lobby',
			},
			'user-join': {
				local: 'You joined the server',
				broadcast: 'A user joined the server',
				depth: 'lobby',
			},
			'user-change': {
				local: 'Your user details have been updated',
				//broadcast: '',
				depth: 'user'
			},
			'user-relocated': {
				local: null,
				broadcast: 'A user joined a room',
				depth: 'lobby'
			},
			'user-kick': {
				local: 'You have been kicked from the server',
				broadcast: 'A user was kicked from the server',
				depth: 'all',
			},
			'user-timeout': {
				local: 'You have been kicked from the server (reason: inactive)',
				broadcast: 'A user was kicked from the server (reason: inactive)',
				depth: 'all',
			},
			'room-create': {
				local: 'The room was successfully created',
				// broadcast: 'A room was successfully created',
				depth: 'none'
			},
			'room-close': {
				local: 'The room was closed',
				broadcast: 'The room has been closed',
				depth: 'room'
			},
			'room-join': {
				local: 'You have successfully joined the room',
				broadcast: 'A user has joined the room',
				depth: 'room',
			},
			'room-leave': {
				local: 'You left the room',
				broadcast: 'A user left the room',
				depth: 'room'
			},
			'room-change': {
				local: 'You\'ve successfully changed the room configuration',
				broadcast: 'none'
			},
			'room-kick': {
				local: 'You have been kicked from the room',
				broadcast: 'A user was kicked from the room',
				depth: 'room',
			},
			'room-owner-change': {
				local: 'The room owner has changed',
				broadcast: 'The room owner has changed',
				depth: 'room'
			}
		};
		this._methods = {
			/**
			 * An empty function which simply updates the last active state
			 * which clients can use to prevent them getting kicked.
			 *
			 * @param  {User} user    Connected user
			 */
			'heartbeat': function(user) {
				user.lastActive = Date.now();
			}.bind(this),
			/**
			 * Sends the identity of a user or themselves.
			 *
			 * @param  {User}     user      Connected user
			 * @param  {string}   target    User to identify
			 * @return {mixed}              User identity information
			 */
			'identify': function(user, target) {
				var obj;

				if (target) {
					for (var idx in this._users) {
						var _user = this._users[idx];
						if (_user.data.name == target || _user.id == target) {
							obj = _user;
							break;
						}
					}
				} else {
					obj = user;
				}

				if (!obj) throw new Error('No such user exists');

				if (target && obj.id !== user.id && obj.room !== user.room) {
					throw new Error('You can only grab user information from the same room');
				}

				var result = obj.exportAsItem();

				if (obj.room) {
					result.room = obj.room.exportAsItem();
				}

				result.role = obj.role;

				return result;
			},
			/**
			 * Ping events
			 * @param {User}    user    User who sent ping
			 */
			'ping': function(user) {
				(new Pong).sendTo(user);
			},
			/**
			 * Pong events
			 */
			'pong': function() { /* Purposefully ignored */ },

			/**
			 * Retrieves user or room information
			 *
			 * (i.e. {method: "get-value", args: ["user.name"], ...})
			 *
			 * @param  {User}   user     Current user
			 * @param  {string} key      Key using dot notation
			 * @return {any}             Result or null
			 */
			'get-value': function(user, key) {
				if (!key) throw new Error('A key must be provided')

				if (key == 'room.passphrase' && user.room) {
					if (!user.room.isAdmin(user)) return null;
					return user.room.password;
				}

				if (key == 'room.relay' && user.room) {
					if (!user.room.isAdmin(user)) return null;
					return user.room.relay;
				}

				// if (key.match(/^room\./) && user.room && !user.room.isAdmin(user)) {
				//     throw new Error('You must be an admin to get a room property!');
				// }

				if (key.indexOf('users.') == 0) {
					// Specifically deal with users.{user-id}.{key}
					var split = key.split('.');
					split.shift();

					var target = this.getUserLoosely(split[0]);
					if (!target) return null;
					split.shift();
					return Utils.getObjectValue(target.data, split.join('.'));
				}

				return Utils.getObjectValue({
					user: user.data,
					room: (user.room ? user.room.data : {})
				}, key);
			}.bind(this),
			/**
			 * Sets user or room information
			 *
			 * (i.e. {method: "set-value", args: ["user.name", "chicken"], ...})
			 *
			 * @param  {User}      user     Current user
			 * @param  {string}    key      Key using dot notation
			 */
			'set-value': function(user, key, value) {
				if (key == 'room.passphrase' && user.room) {
					if (!user.room.isAdmin(user)) return;
					user.room.password = value;
					return;
				}

				if (key == 'room.relay' && user.room) {
					if (!user.room.isAdmin(user)) return null;
					user.room.relay = value;
					return;
				}

				if (key.match(/^room\./) && user.room && !user.room.isAdmin(user)) {
					throw new Error('You must be an admin to set a room property!');
				}

				if (key.indexOf('users.') == 0) {
					// Specifically deal with users.{user-id}.{key}
					var split = key.split('.');
					split.shift();

					var target = this.getUser(split[0]);
					if (!target) return null;
					split.shift();
					return Utils.setObjectValue(target.data, split.join('.'), value);
				}

				Utils.setObjectValue({
					user: user.data,
					room: (user.room ? user.room.data : {})
				}, key, value);
			}.bind(this),
			/**
			 * Allows a user to leave the server
			 * @param  {User} user    Current user
			 */
			'leave': function(user) {
				user.leave();
			}.bind(this),
			/**
			 * Messages a room or a person
			 *
			 * Message expected in a easy object format:
			 * ... "message": {
			 *         "for": {"type": "user|room", "id": "..."},
			 *         "date": 0, // utc unix epoch
			 *         "content": {"type": "text/plain", "data": "Hello World"}
			 * }
			 * @param  {User}    user       Current user
			 * @param  {Message} message    Message to post (contains recipient)
			 */
			'message': function(user, message) {
				if (!message) throw new Error('Message is required');

				if (!Utils.isType(message, 'Object')) throw new Error('Message must be an object');

				if (!message.for) throw new Error('Message must have a recipient');

				if (!message.content) throw new Error('Message must contain data');

				if (message.for.type == 'room') {
					if (!user.room) {
						throw new Error('User is not in a room!');
					}
					if (message.for.id != user.room.id) {
						throw new Error('Message cannot be sent to this room');
					}
					user.room.message(new Message(user, user.room, message.content));
				} else if (message.for.type == 'user') {
					var target = this.getUserLoosely(message.for.id);

					if (!target) throw new Error('Recipient user does not exist');

					target.message(new Message(user, target, message.content));
				} else {
					this.message(new Message(user, this, message.content));
				}
			}.bind(this),
			/**
			 * Sets a user's role in a lobby or room.
			 *
			 * Specific permissions apply to this so that user's cannot change
			 * each others roles
			 *
			 * @param  {User}       user    User instance
			 * @param  {string}     name    Room name
			 * @return {boolean}            Whether room was created
			 */
			'set-role': function(user, target, role) {
				target = this.getUserLoosely(target);

				if (!target) throw new Error('Invalid user specified');

				throw new Error('You cannot directly set a user role');
			}.bind(this),

			/**
			 * Upgrades a user's role in a lobby or room.
			 *
			 * Specific permissions apply to this so that user's cannot change
			 * each others roles
			 *
			 * @param {User}      user      User instance
			 * @param {string}    target    Target user to change role
			 * @param {string}    role      Role to upgrade user to
			 */
			'upgrade-role': function(user, target, role) {
				target = this.getUserLoosely(target);

				if (!target) throw new Error('Invalid user specified');

				if (target.room && target.room !== user.room) {
					throw new Error('The target user must be in the same room');
				}

				if (
					(user.room && !user.room.isAdmin(user)) ||
					(!user.room && !this.isAdmin(user))
				) {
					throw new Error('You do not have permission to change roles');
				}

				if (role == 'room.owner' || role.indexOf('superuser') > -1) {
					throw new Error('Role is unobtainable in this manner');
				}

				// Silently fail
				if (target.hasRole(role)) return;

				target.upgradeRole(role);
			},

			/**
			 * Downgrades a user's role in a lobby or room.
			 *
			 * Specific permissions apply to this so that user's cannot change
			 * each others roles
			 *
			 * @param {User}      user      User instance
			 * @param {string}    target    Target user to change role
			 * @param {string}    role      Role to downgrade user to
			 */
			'downgrade-role': function(user, target, role) {
				target = this.getUserLoosely(target);

				if (!target) throw new Error('Invalid user specified');

				if (target.room && target.room !== user.room) {
					throw new Error('The target user must be in the same room');
				}

				if (!user.room.isAdmin(user)) {
					throw new Error('You do not have permission to change roles');
				}

				if (role == 'room.owner') {
					throw new Error('Role is unobtainable in this manner');
				}

				// Silently fail
				if (!target.hasRole(role)) return;

				// We will destroy this role rather than popping a role!
				target.destroyRole(role);
			},
			/**
			 * Retrieves a target user's current role
			 * @param  {User}       user    User instance
			 * @param  {string}     name    Room name
			 * @return {boolean}            Whether room was created
			 */
			'get-role': function(user, target) {
				target = this.getUserLoosely(target);

				if (!target) throw new Error('Invalid user specified');

				if (target.room && target.room !== user.room) {
					throw new Error('The target user must be in the same room');
				}

				return target.role || 'guest';
			},
			/**
			 * Retrieves the available roles for a target user
			 *
			 * @param  {User}      user      User instance (requesting)
			 * @param  {string}    target    Target to get roles for
			 * @return {string[]}            List of roles for target
			 */
			'get-roles': function(user, target) {
				target = this.getUserLoosely(target);

				if (!target) throw new Error('Invalid user specified');

				if (target.room && target.room !== user.room) {
					throw new Error('The target user must be in the same room');
				}

				if (target.room) {
					return [
						'room.member',
						'room.moderator',
						'room.admin',
						'room.owner'
					];
				} else {
					return [
						'guest',
						'lobby.member',
						'lobby.moderator',
						'lobby.admin'
					];
				}
			},
			/**
			 * Sets the owner of a room
			 *
			 * You must be either a room admin or owner, and you must be in the
			 * same room.
			 *
			 * @param  {User}      user      Current user
			 * @param  {string}    target    Target user to set room owner
			 * @return {boolean}             Whether change was successful
			 */
			'set-owner': function(user, target) {
				target = this.getUserLoosely(target);

				if (!target) throw new Error('Invalid user specified');

				if (target.room && target.room !== user.room) {
					throw new Error('The target user must be in the same room');
				}

				if (!(target.role == 'role.admin' || target.role == 'role.owner')) {
					throw new Error('You don\'t have permission to set the room owner');
				}

				target.room.setOwner(target);
			},
			/**
			 * Kicks a naughty user
			 *
			 * Kicking does not ban them, you should ban them if you expect a
			 * less temporary solution.
			 *
			 * Kicking from a room will send them back to the lobby than the
			 * server itself.
			 *
			 * @param  {User}      user      Current user
			 * @param  {string}    target    Target user to kick
			 * @param  {string}    reason    Reason for kicking
			 */
			'kick': function(user, target, reason) {
				target = this.getUserLoosely(target);
				reason = reason || 'Unacceptable behaviour (default)';

				if (!target) {
					throw new Error('Cannot kick invalid user');
				}

				var room = (target.room == user.room ? user.room : null);

				// Target and user are not in room & user is lobby moderator+ or
				// Target and user are in  a  room & user is room  moderator+...
				if (!(
					(room && room.isModeratorPlus(user)) ||
					(!room && this.isModeratorPlus(user))
				)) {
					throw new Error('You do not have permission to perform this action');
				}

				if (room) {
					room.kickUser(target, reason);
				} else {
					target.kick(reason);
				}
			}.bind(this),
			/**
			 * Lists current users in a room or lobby.
			 *
			 * If you're in a room you will never get any lobby users, if you're
			 * in a lobby, you get all the users (unless said user is in a room)
			 *
			 * @param  {User}       user    User instance
			 * @return {Array}              Array of user info
			 */
			'list-users': function(user) {
				var results = [];
				var users;

				if (user.room) {
					var room = this.getRoom(user);

					users = room.getUsers();
					for (var idx in users) {
						results.push(this.getUser(users[idx]).exportAsItem());
					}

					return results;
				}

				users = this.getUsers();

				for (var idx in users) {
					idx = this.getUser(users[idx]);
					if (idx.room) continue;
					results.push(idx.exportAsItem());
				}

				return results;
			}.bind(this),
			/**
			 * Creates a room for a user in a lobby.
			 * @param  {User}       user          User instance
			 * @param  {string}     name          Room name
			 * @param  {boolean}    visibility    Allow a room to be visible to
			 *                                    the lobby
			 * @param  {string}     passphrase    Set a room join passphrase
			 * @return {boolean}                  Whether room was created
			 */
			'create-room': function(user, name, visible, passphrase) {
				if (user.room != null) {
					throw new Error('Already in a room!');
				}
				// Late-binding is necessary here
				var Room = require(Lobby.RoomModule);

				if (name && this.getRoomLoosely(name)) {
					throw new Error("Room already exists");
				}

				var room = new Room(user, name, visible, passphrase);

				if (Utils.isType(name, 'string') && name.match(/[\w\d\-]+/g)) {
					room.setName(name);
				}

				this.addRoom(room);
				return room.exportAsItem();
			}.bind(this),
			/**
			 * Lists the rooms available to join for a user
			 *
			 * If the user is already in a room, we will return null.
			 *
			 * @param  {User}       user    User instance
			 * @param  {String}     name    Room name
			 * @return {boolean}            Whether room was created
			 */
			'list-rooms': function(user) {
				if (user.room) return null;
				return this.getRoomList();
			}.bind(this),
			/**
			 * Checks whether a room exists by name or id
			 *
			 * @param  {User}      user      User instance
			 * @param  {string}    target    Room name or id
			 * @return {boolean}             Whether room exists
			 */
			'check-room': function(user, target) {
				return !!this.getRoomLoosely(target);
			}.bind(this),
			/**
			 * Allows a user to join a room
			 *
			 * The room can be protected with a passphrase. Ideally one should
			 * check the room has a passphrase before attempting to join...
			 *
			 * @param  {User}       user        User instance
			 * @param  {string}     name        Room name
			 * @param  {string}     passphrase  Room passphrase
			 * @throws {Error}                  If a join error occurs
			 */
			'join-room': function(user, name, passphrase) {
				if (user.room) {
					throw new Error('You\'re already in a room');
				}

				var room = this.getRoomLoosely(name);

				if (!room) throw new Error('Room doesn\'t exist');
				room.join(user, passphrase);

				if (user.room) return user.room.exportAsItem();
			}.bind(this),
			/**
			 * Allows a user to leave a room
			 *
			 * @param  {User}       user    User instance
			 * @throws {Error}              If a leave error occurs
			 */
			'leave-room': function(user) {
				var room = (user.room ? this.getRoom(user.room) : null);

				if (!room) throw new Error('You\'re not in a room!');

				room.leave(user);
			}.bind(this),
			/**
			 * Allows room admins to close a room
			 * @param  {[type]} user [description]
			 * @return {[type]}      [description]
			 */
			'close-room': function(user) {
				var room = (user.room ? this.getRoom(user.room) : null);

				if (!room) throw new Error('You\'re not in a room!');

				if (!room.isAdmin(user)) throw new Error('You must be an admin to close a room!');

				room.close(user, 'user-action');
			}.bind(this),
			/**
			 * Shows server statistics
			 *
			 * @returns {object}    User and Room count
			 */
			'show-stats': function(user) {
				return this.getStatistics();
			}
		};

		this._users = {};
		this._rooms = {};

		// Limit events to server only, allow developer to control event
		// notifications when turned off.
		this.notifyEvents = true;

		// Allow rooms and users to expire when they become inactive
		this.expirePeriod = 60e3 * 5; // 5m in ms
		this.expireRooms = true;
		this.expireUsers = true;

		// Always start the expiry collector when constructed.
		this.startExpiryCollector();
	}

	exportAsItem() {
		return {type: 'Lobby'}
	}

	export() {
		return this.exportAsItem();
	}

	/**
	 * Returns the singleton instance of the lobby.
	 * @returns {Lobby}    Lobby instance
	 */
	static instance() {
		var lobby = Lobby.instance._instance || new Lobby();

		Lobby.instance._instance = lobby;

		return lobby;
	}

	/**
	 * Returns if user is a lobby moderator or administrator
	 *
	 * @param  {User}       user    User to check
	 * @return {Boolean}            If roles are present
	 */
	isModeratorPlus(user) {
		return user.hasRole('lobby.moderator') || user.hasRole('lobby.admin');
	}

	/**
	 * Returns if the user is a lobby moderator
	 *
	 * @param  {User}       user    User to check
	 * @return {Boolean}            If roles are present
	 */
	isModerator(user) {
		return user.hasRole('lobby.moderator');
	}

	/**
	 * Returns if user is a lobby admin
	 *
	 * @param  {User}       user    User to check
	 * @return {Boolean}            If roles are present
	 */
	isAdmin(user) {
		return user.hasRole('lobby.admin');
	}

	/**
	 * Returns current statistics of the lobby.
	 * @returns {object}    User and Room count
	 */
	getStatistics() {
		return {
			users: this._users.length,
			rooms: this._rooms.length,
		}
	}

	/**
	 * Retrieves all lobby users.
	 */
	getUsers() {
		return this._users;
	}

	/**
	 * Returns a safe user list
	 */
	getUserList() {
		return Object.values(this._users).map((e) => e.exportAsItem());
	}

	/**
	 * Returns a safe user list with all details
	 */
	getUserListDetailed() {
		return Object.values(this._users).map((e) => e.export());
	}

	/**
	 * Retrieves a valid user in the lobby by id or by instance.
	 *
	 * If the user is not a valid member of the lobby, we will return null.
	 *
	 * This can reduce the need to use hasUser and getUser separately.
	 *
	 * @param {any} user    User instance or id
	 */
	getUser(user) {

		if (this.hasUser(user)) {
			if (Utils.isType(user, 'String')) {
				return this._users[user]
			} else /* if (Utils.isType(user, 'User')) */ {
				return user;
			}
		}

		return null;
	}

	/**
	 * Retrieves a valid user in the lobby by id or name.
	 *
	 * If the user is not known to the lobby, we will return null.
	 *
	 * @param {string} name    Room name or id
	 */
	getUserLoosely(name) {
		for (var idx in this._users) {
			var user = this._users[idx];
			if (user.id == name || user.data.name == name) {
				return user;
			}
		}
		return null;
	}

	/**
	 * Returns whether a user is in the lobby system
	 * @param {string|User} user    User to check
	 */
	hasUser(user) {
		if (Utils.isType(user, 'String')) {
			return this._users.hasOwnProperty(user);
		} else if (Utils.isType(user, 'User')) {
			return this._users.hasOwnProperty(user.id);
		}

		return false;
	}

	/**
	 * Creates a user from a socket
	 *
	 * This is the ideal method to allow a user to join a server.
	 *
	 * @param  {any?} socket  Newly created socket
	 * @return {User} user    User created
	 */
	createUser(socket) {
		// Late binding to prevent coupling dependency issues, yes, this code
		// is quite highly coupled at the moment...
		var User = require(Lobby.UserModule);
		var user = new User(socket);
		return user;
	}

	/**
	 * Adds a user to the lobby system.
	 * @param {User} user    User instance
	 */
	addUser(user) {

		if (!Utils.isType(user, 'User')) {
			throw new Error(`Unable to add user of type '${Utils.getType(user)}'`);
		}

		if (!(user.id && user.id.length > 0)) {
			// Avoid id clashes with null/empty ids
			throw new Error(`Unable to continue with ordinary user <empty>`);
		}

		if (this._users.hasOwnProperty(user.id)) {
			throw new Error(`Unable to add user duplicate <${user.id}>`);
		}

		user.upgradeRole('lobby.member');
		this._users[user.id] = user;

		return this;
	}

	/**
	 * Removes a user from the lobby system.
	 * @param {User} user    User instance
	 */
	removeUser(user) {

		if (!Utils.isType(user, 'User')) {
			throw new Error(`Unable to remove user of type '${Utils.getType(user)}'`);
		}

		if (!this._users.hasOwnProperty(user.id)) {
			throw new Error(`Unable to remove non-existant user <${user.id}>`);
		}

		this._users[user.id] = null;
		delete this._users[user.id];

		return this;
	}

	/**
	 * Retrieves all lobby rooms.
	 */
	getRooms() {
		return this._rooms;
	}

	/**
	 * Returns a safe room list for a user
	 */
	getRoomList() {
		return Object.values(this._rooms).filter((e) => e.visible).map((e) => e.exportAsItem());
	}

	/**
	 * Returns a safe room list for a user with all details
	 */
	getRoomListDetailed() {
		return Object.values(this._rooms).map((e) => e.export());
	}

	/**
	 * Retrieves a valid room in the lobby by id, instance or user.
	 *
	 * If the room is not known to the lobby, we will return null.
	 *
	 * This can reduce the need to use hasRoom and getRoom separately.
	 *
	 * @param {any} obj    Room instance or Room id
	 */
	getRoom(obj) {
		if (Utils.isType(obj, 'User')) {
			obj = obj.room;
		}

		if (Utils.isType(obj, 'Room')) {
			// If we're already a valid room, pass it straight back
			// Note: This will invalidate any invalid room
			return (this._rooms.hasOwnProperty(obj.id) ? obj : null);
		}

		if (Utils.isType(obj, 'String') && this.hasRoom(obj)) {
			return this._rooms[obj];
		}

		return null;
	}

	/**
	 * Retrieves a valid room in the lobby by id or name.
	 *
	 * If the room is not known to the lobby, we will return null.
	 *
	 * @param {string} name    Room name or id
	 */
	getRoomLoosely(name) {
		for (var idx in this._rooms) {
			var room = this._rooms[idx];
			if (room.id == name || room.data.name == name) {
				return room;
			}
		}
		return null;
	}

	/**
	 * Returns whether a room is in the lobby system
	 * @param {string|Room} room    Room to check
	 */
	hasRoom(room) {

		if (Utils.isType(room, 'String')) {
			return this._rooms.hasOwnProperty(room);
		} else if (Utils.isType(room, 'Room')) {
			return this._rooms.hasOwnProperty(room.id);
		}

		return false;
	}

	/**
	 * Adds a room from the lobby system.
	 * @param {Room} room    Room instance
	 */
	addRoom(room) {

		if (!Utils.isType(room, 'Room')) {
			throw new Error(`Unable to add room of type '${Utils.getType(room)}'`);
		}

		if (!(room.id && room.id.length > 0)) {
			// Avoid id clashes with null/empty ids
			throw new Error(`Unable to continue with ordinary room <empty>`);
		}

		if (this._rooms.hasOwnProperty(room.id)) {
			throw new Error(`Unable to add room duplicate <${room.id}>`);
		}

		this._rooms[room.id] = room;

		return this;
	}

	/**
	 * Removes a room from the lobby system.
	 * @param {Room} room    Room instance
	 */
	removeRoom(room) {

		if (!Utils.isType(room, 'Room')) {
			throw new Error(`Unable to remove room of type '${Utils.getType(room)}'`);
		}

		if (!this._rooms.hasOwnProperty(room.id)) {
			throw new Error(`Unable to remove non-existant room <${room.id}>`);
		}

		if (!room.isClosed()) {
			room.close(this);
		}

		this._rooms[room.id] = null;
		delete this._rooms[room.id];

		return this;
	}

	/**
	 * Returns an event notifier according to the key.
	 *
	 * This is used during lobby, user and room events and can be emitted as
	 * notification events to clients, and attachable as a lobby object event
	 *
	 * @param {string} key    Notifier name
	 */
	getEventNotifier(key) {
		return this._events[key];
	}

	/**
	 * Sets an event notifier according to the key
	 *
	 * The value should be an array with local, broadcast and depth keys. Local
	 * sets what the instigator receives, broadcast is what everyone else who is
	 * included in the depth, will see. For example, a depth of all will notify
	 * all clients.
	 *
	 * Depths supported: all, room, lobby, user
	 *
	 * Local and broadcast values are normally alert messages and should avoid
	 * being used for system processing (i.e. json encoded data).
	 *
	 * This is used during lobby, user and room events and can be emitted as
	 * notification events to clients, and attachable as a lobby object event
	 *
	 * @param {string} key       Notifier key
	 * @param {object} value     Notifier event status
	 */
	setEventNotifier(key, value) {
		this._events[key] = value;
		return this;
	}

	/**
	 * Returns whether an event notifier exists
	 *
	 * @param  {string}  key     Notifier key
	 * @return {Boolean}         Whether notifier exists
	 */
	hasEventNotifier(key) {
		return !!this._events[key];
	}

	/**
	 * Emits events when the environment changes.
	 *
	 * Additional data is not typically required but has been allowed here for
	 * future requirements.
	 *
	 * @param {User|Room}   instance    User or Room instance
	 * @param {string}      event       Event name
	 * @param {object}      data        Event data (optional)
	 */
	emit(instance, event, data) {
		this._emitNotifier(instance, event, data);

		return this._emitter.emit(event, ...[event, instance, data]);
	}

	/**
	 * Emits a notification to the user and local environment to changes.
	 *
	 * Additional data is not typically required but has been allowed here for
	 * future requirements.
	 * @param {User|Room}   instance    User or Room instance
	 * @param {string}      event       Event name
	 * @param {object}      data        Event data (optional)
	 */
	_emitNotifier(instance, event, data) {
		if (!this.notifyEvents) return this;

		data = data || {};

		if (!Utils.isType(event, 'string')) {
			throw new Error('Event name must be a string');
		}

		if (Utils.isType(instance, 'string')) {
			instance = this.getUser(instance) || this.getRoom(instance);
		}

		if (!instance) {
			throw new Error('Event must contain an event source instance.');
		}

		var user = null;
		var room = null;

		var instigator = '';

		if (Utils.isType(instance, 'Room')) {
			room = instance;
			data.room = room.exportAsItem();
			instigator = `room "${room.getName()}"`;
		} else if (Utils.isType(instance, 'User')) {
			user = instance;
			data.user = user.exportAsItem();

			if (event.split('-')[0] == 'room' && user.room) {
				room = user.room;
				data.room = room.exportAsItem();
			}

			instigator = `user "${user.getName()}"`;
		} else {
			throw new Error('Event must be instigated by a room or user');
		}

		if (!this.hasEventNotifier(event)) {
			Utils.debug(`Unknown event '${event}' was emitted by ${instigator}`);
			return this;
		}

		var notifier = this.getEventNotifier(event);
		var factory = `Event <${event}> was raised`;
		var local = new Notification(event, notifier.local || factory, data);
		var broadcast = new Notification(event, notifier.broadcast || factory, data);
		var depth = notifier.depth || 'none';
		// var timing = notifier.timing || ['local', 'broadcast'];

		local.user = broadcast.user = data.user;
		local.room = broadcast.room = data.room;

		Utils.debug(`${factory} by ${instigator} (depth: ${depth})`);

		// Only notify the user when a local notifier exists and do it alone
		if (user && notifier.local) user.notify(local);

		// Only broadcast if a broadcast notifier exists, exempted from the
		// user themselves.
		if (!notifier.broadcast) return this;

		if (depth === 'room' && room) {
			room.notify(broadcast, user);
		} else if (depth === 'lobby') {
			this.notify(broadcast, user);
		} else if (depth === 'all') {
			this.notifyAll(broadcast, user)
		}

		return this;
	}

	/**
	 * Adds event handlers to the event emitter.
	 * @param  {...any} any
	 */
	on(...any) {
		return this._emitter.on.apply(this._emitter, any);
	}

	/**
	 * Notify people in the lobby
	 * @param {Notification}  notification    Notification instance
	 * @param {User[]|User}   exclude         Users to exclude
	 */
	notify(notification, exclude) {
		if (!Utils.isType(notification, 'Notification')) {
			throw new Error(`Cannot notify user with invalid type '${Utils.getType(notification)}'`);
		}

		if (Utils.isType(exclude, 'User')) {
			exclude = [exclude];
		}

		exclude = exclude || [];

		if (!Utils.isType(exclude, 'Array')) {
			throw new Error(`Cannot exclude users from notification with type '${Utils.getType(exclude)}'`);
		}

		notification.sendTo(Object.values(this._users).filter((e) => !e.room && !~exclude.indexOf(e)));

		return this;
	}

	/**
	 * Notifies people, regardless of location.
	 * @param {Notification} notification     Notification instance
	 * @param {User[]|User}  exclude          Users to exclude
	 */
	notifyAll(notification, exclude) {
		if (!Utils.isType(notification, 'Notification')) {
			throw new Error(`Cannot notify users with invalid type '${Utils.getType(notification)}'`);
		}

		if (Utils.isType(exclude, 'User')) {
			exclude = [exclude];
		}

		exclude = exclude || [];

		if (!Utils.isType(exclude, 'Array')) {
			throw new Error(`Cannot exclude users from notification with type '${Utils.getType(exclude)}'`);
		}

		notification.sendTo(Object.values(this._users).filter((e) => !~exclude.indexOf(e)));

		return this;
	}

	/**
	 * Message people in the lobby
	 * @param {Message}     message    Message instance
	 * @param {User[]|User} exclude    Users to exclude
	 */
	message(message, exclude) {
		if (!Utils.isType(message, 'Message')) {
			throw new Error(`Cannot message users with invalid type '${Utils.getType(message)}'`);
		}

		if (Utils.isType(exclude, 'User')) {
			exclude = [exclude];
		}

		exclude = exclude || [];

		if (!Utils.isType(exclude, 'Array')) {
			throw new Error(`Cannot exclude users from message with type '${Utils.getType(exclude)}'`);
		}

		message.setType('lobby');
		message.setReceiver(null);

		message.sendTo(Object.values(this._users).filter((e) => !e.room && !~exclude.indexOf(e)));

		return this;
	}

	/**
	 * Message people regardless of location.
	 * @param {Message}     message    Message instance
	 * @param {User[]|User} exclude    Users to exclude
	 */
	messageAll(message, exclude) {
		if (!Utils.isType(message, 'Message')) {
			throw new Error(`Cannot message users with invalid type '${Utils.getType(message)}'`);
		}

		if (Utils.isType(exclude, 'User')) {
			exclude = [exclude];
		}

		exclude = exclude || [];

		if (!Utils.isType(exclude, 'Array')) {
			throw new Error(`Cannot exclude users from message with type '${Utils.getType(exclude)}'`);
		}

		message.setType('lobby');
		message.setReceiver(null);

		message.sendTo(Object.values(this._users).filter((e) => !~exclude.indexOf(e)));

		return this;
	}

	/**
	 * Broadcast raw message to every user regardless of location.
	 *
	 * @param {string}   message    Raw message string
	 * @param {User[]}   users      Users to message
	 * @param {User[]}   exclude    Users to exclude from message
	 * @param {boolean}  close      Whether to close users afterwards
	 */
	broadcast(message, users, exclude, close) {
		if (!users) return;

		for (var index in users) {
			var user = users[index];

			if (
				user == exclude ||
				(exclude.indexOf && exclude.indexOf(user) > -1)
			) continue;

			// If passed a user identification string, look them up
			if (typeof(user) == 'string') {
				user = this.getUser(user);
			}

			// Ignore invalid users
			if (!user) continue;

			user.send(message);
			if (close) user.close();
		}
	}

	/**
	 * Attempt to run a lobby method for the entity
	 *
	 * The entity can be a user or the server. It's up to the developer to add
	 * any error handling as this method will throw errors!
	 *
	 * @param  {User}       entity    Request's entity
	 * @param  {string}     method    Method to evaluate
	 * @param  {string}     args      Method arguments
	 * @return {any}                  Method result
	 * @throws {error}                Method not found or method runtime error
	 */
	runMethod(entity, method, args) {
		args = Array.isArray(args) ? args : [];

		if (entity == 'lobby' || entity == 'super' || entity == 'server') {
			var User = require(Lobby.UserModule);
			var superuser = new User();
			// This should never happen but we will attempt to remove it if this
			// does happen. We wouldn't want the user around to be exploited.
			// TODO: Potentially remove or think of a better way around this!
			if (this.getUser(superuser.id)) {
				this.removeUser(superuser.id);
			}
			superuser.id = undefined;
			superuser.data.name = 'Server';
			superuser.roleStack = [
				'guest',
				'lobby.member',
				'lobby.moderator',
				'lobby.admin',
				'lobby.superuser',
				'room.member',
				'room.moderator',
				'room.admin',
				'room.owner',
				'room.superuser'
			];
			superuser.role = 'lobby.superuser';
			entity = superuser;
		}

		if (!Utils.isType(entity, 'User')) {
			throw new Error('Permission Denied');
		}

		if (!(
			this._methods.hasOwnProperty(method) &&
			typeof(this._methods[method]) == 'function'
		)) {
			throw new Error('No such method exists');
		}

		args.unshift(entity);

		return this._methods[method].apply(this, args);
	}

	addMethod(key, callback) {
		this._methods[key] = callback;
	}

	removeMethod(key) {
		delete this._methods[key];
	}

	/**
	 * Recycles any expired rooms and users
	 */
	recycle() {
		if (this.expireRooms) {
			// Disabled until we can figure out a good way of preventing empty
			// or highly inactive rooms!
			// for (var i in this._rooms) {
			//     var room = this._rooms[i];
			//     // Remove a room if inactive for 5 minutes
			//     if (Date.now() - (room.lastActive || Date.now()) > this.expirePeriod) {
			//         room.close('timeout', 'inactivity timeout');
			//     }
			// }
		}

		if (this.expireUsers) {
			for (var i in this._users) {
				var user = this._users[i];
				// Remove a client if inactive for 5 minutes
				if (Date.now() - (user.lastActive || Date.now()) > this.expirePeriod) {
					user.kick('timeout', 'inactivity timeout');
				}
			}
		}
	}

	/**
	 * Starts the timer for the cleanup process
	 */
	startExpiryCollector() {
		// Clean up stuff after a while to prevent too many inactive users
		if (this.expirePeriod && this.expirePeriod > 0) {
			this._expireInterval = setInterval(this.recycle.bind(this), 60e3);
		}
	}

	/**
	 * Stop the timer for the cleanup process
	 */
	stopExpiryCollector() {
		if (this._expireInterval) {
			clearInterval(this._expireInterval);
		}
	}
}

var path = require('path');
Lobby.RoomModule = path.resolve(__dirname, './room');
Lobby.UserModule = path.resolve(__dirname, './user');

module.exports = Lobby;