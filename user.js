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
const Utils = require('./libs/utils');
const RPC = require('./libs/json-rpc');
const Lobby = require('./lobby');
const Notification = require('./messages/notification');

const lobby = Lobby.instance();

class User {

	constructor(socket) {
		this.socket = socket;
		this.socketStatus = 'open';
		this.socketType = (
			socket && socket.constructor ? socket.constructor.name : null
		);
		this.id = Utils.createID('uuid4');
		this.data = {
			name: Utils.createID('phrase')
		};
		this.created = Date.now();
		this.lastActive = Date.now();
		this.room = null;
		this.role = 'guest';
		this.roleStack = [];
		this.disabled = false;
		this.messageID = 0;

		// Fake user without socket, do not continue with setup...
		if (!socket) return;

		socket.on('close', function() {
			if (this.socketStatus != 'closed') {
				this.leave('user-broken-connection', 'The connection has unexpectedly closed (hard-exit?)');
			}
			this.socketStatus = 'closed';
		}.bind(this));

		var onDataEventKey = (
			this.socketType == 'WebSocket' ?
			'message' : 'data'
		);
		var buffer;

		socket.on(onDataEventKey, function(data) {
			var newline = data.indexOf('\n');
			if (onDataEventKey == 'data' && newline == -1) {
				if (!buffer) buffer = Buffer.from('');
				buffer += data;
				return;
			}

			if (onDataEventKey == 'data') {
				if (!buffer) buffer = Buffer.from('');
				if (newline == -1) {
					data = buffer + data;
					buffer = Buffer.from('');
				} else {
					var leftover = data.slice(newline+1);
					data = buffer + data.slice(0, newline);
					buffer = Buffer.from(leftover);
				}
			}

			data = data.toString().replace(/\r/g, '');
			if (!data) return;

			var relay = data.slice(0, 5) == 'relay';
			var room = (this.room ? lobby.getRoom(this.room) : null);
			var rpc = null;

			try {
				if (relay && !room) {
					throw new Error('You cannot relay outside of a room!');
				} else if (relay && room && !room.relay) {
					throw new Error('You cannot relay in this room!');
				} else if (relay && room && room.relay) {
					// Try and relay as fast as possible...
					lobby.broadcast(data.slice(0, 6), lobby.getUsers(), this);
					return;
				}

				try {
					rpc = JSON.parse(data);
				} catch (err) {
					// Throw generic error to client
					this.send((new RPC.Response(null, new Error('Invalid Syntax'), null)).export());
					this.close();
					return;
				}

				// RPC batches
				if (Array.isArray(rpc)) {
					var batch = rpc;
					for (var idx in batch) {
						rpc = batch[idx];
						rpc = RPC.Request.import(rpc) || RPC.Response.import(rpc);
						batch[idx] = null;

						if (!Utils.isType(rpc, 'Request')) {
							// Do nothing (as a server) on a response
							return;
						}

						try {
							// Do some method requests
							var response = lobby.runMethod(this, rpc.method, rpc.params);
							if (response) batch[idx] = new RPC.Response(rpc.id, null, response);
						} catch (err) {
							batch[idx] = new RPC.Response(rpc.id, err, null);
						}
					}
					batch = batch.filter((e) => e);
					this.send(JSON.stringify(batch));
				} else {
					rpc = RPC.Request.import(data) || RPC.Response.import(data);
					if (!Utils.isType(rpc, 'Request')) {
						// Do nothing (as a server) on a response
						return;
					}
					// Do some method requests
					var response = lobby.runMethod(this, rpc.method, rpc.params);
					if (response) this.send((new RPC.Response(rpc.id, null, response)).export());
				}

			} catch (err) {
				console.error(`User <${this.id}> experienced error:`, err);
				if (relay) {
					// Figure out what to send back since it can be any message
					this.notify(new Notification('error', err.message));
				} else if (Utils.isType(rpc, 'Request')) {
					this.send((new RPC.Response(rpc.id, err, null)).export());
				}
			}
		}.bind(this));

		lobby.addUser(this);
		lobby.emit(this, 'user-join');
	}

	/**
	 * Returns the unique id of the user
	 */
	getID() {
		return this._id;
	}

	/**
	 * Returns name of user
	 */
	getName() {
		return this.data.name;
	}

	/**
	 * Returns name of user
	 */
	setName(value) {
		if (typeof(value) !== 'string' && value.match(/[\w\-\_\d ]+/)) {
			throw new Error('User name must be a valid non-empty alphanumeric string');
		}

		this.data.name = value;

		return this;
	}

	/**
	 * Returns safe information (id and name) as an id item for user
	 */
	exportAsItem() {
		return {
			id: this.id,
			name: this.data.name,
			type: 'user'
		};
	}

	/**
	 * Export user data
	 */
	export() {
		return {
			id: this.id,
			room: this.room,
			role: this.role,
			data: this.data,
			type: 'user'
		};
	}

	/**
	 * Retrieve user data, optionally with a key
	 */
	getData(key) {
		var keys = (key ? key.split('.') : []);
		var temp = this.data;
		for (var i in keys) {
			var key = keys[i];
			if (!temp[key]) {
				return null;
			}
			temp = temp[key];
		}

		return temp;
	}

	/**
	 * Set user data
	 */
	setData(key, value) {
		var keys = (key ? key.split('.') : []);
		var temp = this.data;
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

		return this;
	}

	/**
	 * Returns whether the user is currently enabled for outbound communication
	 */
	isEnabled() {
		return !this._disabled;
	}

	/**
	 * Returns whether the user is currently disabled for outbound communication
	 */
	isDisabled() {
		return this._disabled;
	}

	/**
	 * Disables the user's outbound communication
	 */
	disable() {
		this._disabled = true;

		return this;
	}

	/**
	 * Enables the user's outbound communcation
	 */
	enable() {
		this._disabled = false;

		return this;
	}

	/**
	 * Kicks the user from the server
	 * @param {string} reason    Reason for kick
	 */
	kick(reason) {

		lobby.emit(this, 'user-kick', {reason: reason, user: this});

		this.close('kick', reason);

		return this;
	}

	/**
	 * Lets the user leave the server peacefully
	 * @param {string} code      code id
	 * @param {string} reason    reason string
	 */
	leave(code, reason) {
		if (this.room) {
			this.room.leave(this, code, reason);
		}

		if (!code || code === 'peaceful') {
			lobby.emit(this, 'user-leave');
		} else if (code == 'user-broken-connection') {
			lobby.emit(this, 'user-broken-connection');
		} /* else if code === 'quiet' || 'kick', etc */

		if (lobby.hasUser(this)) {
			lobby.removeUser(this);
		}

		return this;
	}

	/**
	 * Closes the user safely
	 * @param {string} code      Code id
	 * @param {string} reason    reason string
	 */
	close(code, reason) {
		this.leave(code, reason);

		this.socketStatus = 'closed';
		if (this.socket && this.socket.close) {
			this.socket.close();
		} else if (this.socket && this.socket.destroy) {
			this.socket.destroy();
		}

		return this;
	}

	/**
	 * Upgrades the current role of the user
	 * @param {string} role    Role id
	 */
	upgradeRole(role) {
		this.roleStack.push(this.role);
		this.role = role;

		return this;
	}

	hasRole(role) {
		return this.role == role || this.roleStack.indexOf(role) > -1;
	}

	/**
	 * Removes the role from the user forever (in the stack and current)
	 * @param {string} role    Role id
	 */
	destroyRole(role) {
		var index = this.roleStack.indexOf(role);
		if (index > -1) {
			delete this.roleStack[index];
		} else if (this.role === role) {
			this.downgradeRole();
		}

		return this;
	}

	/**
	 * Downgrades a role from what they originally were (e.g. room > lobby)
	 */
	downgradeRole() {
		this.role = this.roleStack.pop();

		return this;
	}

	/**
	 * Sends a direct message to a user
	 * @param {Message} message    Message instance
	 */
	message(message) {

		if (!Utils.getType(message, 'Message')) {
			throw new Error('Invalid message type');
		}

		if (!Utils.getType(message.getSender(), 'User')) {
			throw new Error('Message requires a sender');
		}

		message.setReceiver(this);
		message.setType('user');

		message.sendTo(this);

		return this;
	}

	/**
	 * Notifies a user.
	 * @param {Notification} notification     Notification instance
	 */
	notify(notification) {

		if (!Utils.isType(notification, 'Notification')) {
			throw new Error(`Cannot notify user with invalid type '${Utils.getType(notification)}'`);
		}

		notification.sendTo(this);

		return this;
	}

	/**
	 * Send a message (string) directly to the user.
	 *
	 * If the user is disabled, no messages will be sent.
	 *
	 * @param  {string} data    String to send
	 */
	send(data) {

		this.lastActive = Date.now();

		if (this._disabled) return this;

		if (this.socketStatus !== 'open') return this;

		if (this.socketType == 'WebSocket' && this.socket && this.socket.send) {
			// if (this.socket.readyState !== this.socket.constructor.OPEN) {
			//     // Same as readyState == WebSocket.OPEN
			//     throw new Error('Socket not ready...');
			// }
			this.socket.send(data + '\n');
		} else if (this.socket && this.socket.write) {
			this.socket.write(data + '\n');
		} else {
			throw new Error('Invalid user socket');
		}

		return this;
	}
}

module.exports = User;