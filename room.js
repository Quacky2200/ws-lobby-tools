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
const Lobby = require('./lobby');

const lobby =  Lobby.instance();

class Room {

	constructor(owner, name, visible, passphrase) {
		this.id = Utils.createID('uuid4');

		this.data = {
			name: name || Utils.createID('phrase'),
		};

		this.created = Date.now();
		this.lastActive = Date.now();
		this.relay = false;
		this.owner = null;
		this.users = [];
		this.passphrase = passphrase || null;
		this.visible = visible === false ? false : true;

		// Whether the owner leaving the room will close or re-assign
		this.ownerLeaveAction = 'assign-first'; // 'close'

		// This can be changed so that everyone who joins can be admins
		this.joinRole = 'room.member';

		if (!(owner && Utils.getType(owner, 'User'))) {
			throw new Error('Room requires an owner');
		}

		lobby.emit(owner, 'room-create', {room: this.exportAsItem()});
		this.join(owner, passphrase);
		this.setOwner(owner);
	}

	/**
	 * Returns the unique id of the room
	 */
	getID() {
		return this._id;
	}

	/**
	 * Returns name of room
	 */
	getName() {
		return this.data.name;
	}

	/**
	 * Returns name of room
	 */
	setName(value) {
		if (typeof(value) !== 'string' && value.match(/[\w\-\_\d ]+/)) {
			throw new Error('Room name must be a valid non-empty alphanumeric string');
		}

		this.data.name = value;

		return this;
	}

	/**
	 * Toggles the room relay
	 * @param {boolean} value    Toggle
	 */
	setRelay(value) {
		this.relay = !!value;
	}

	/**
	 * Returns safe information (id and name) as an id item for users
	 */
	exportAsItem() {
		return {
			id: this.id,
			name: this.data.name,
			type: 'room',
			user_count: this.users.length,
			passphrase: !!this.passphrase
		};
	}

	/**
	 * Exports room data as new object
	 */
	export() {
		return {
			id: this.id,
			owner: this.owner,
			data: this.data,
			relay: this.relay,
			owner: this.owner,
			created: this.created,
			lastActive: this.lastActive,
			type: 'room',
			user_count: this.users.length,
			passphrase: !!this.passphrase
		};
	}

	/**
	 * Returns all users inside the room (unsafe)
	 */
	getUsers() {
		this.lastActive = Date.now();

		return this.users;
	}

	/**
	 * Returns a safe list of the users currently inside the room
	 */
	getUserList() {
		this.lastActive = Date.now();

		return this.users.map((e) => user.exportAsItem());
	}

	/**
	 * Returns a safe list of the users currently inside the room with details
	 */
	getUserListDetailed() {
		this.lastActive = Date.now();

		return this.users.map((e) => user.export());
	}

	/**
	 * Returns whether a user is presently in the room
	 * @param {User} user
	 */
	isUserPresent(user) {
		return (
			Utils.isType(user, 'User') &&
			~this.users.indexOf(user) &&
			user.room.id == this.id
		);
	}

	/**
	 * Returns whether the user is an owner of the room
	 * @param {User} user    User instance
	 */
	isOwner(user) {
		return (this.isUserPresent(user) &&
			user.id === this.owner &&
			user.role === 'room.owner');
	}

	/**
	 * Retrieves the owner of the room.
	 *
	 * If the user is invalid (desynced), the owner id is removed.
	 */
	getOwner() {
		var user = lobby.getUser(this.owner);

		if (!user) {
			// Remove the owner if the user cannot be represented
			this.owner = null;
		}

		return user;
	}

	/**
	 * Sets the current user to the owner
	 * @param {User} user    User instance
	 */
	setOwner(user) {

		this.lastActive = Date.now();

		user = lobby.getUser(user);

		if (!user) {
			throw new Error('User is not a member of the lobby');
		}

		if (!this.isUserPresent(user)) {
			throw new Error('User must be in the room to become an owner of it');
		}

		if (this.owner) {
			this.owner.destroyRole('room.owner');
			//this.owner.destroyRole('room.admin');
		}

		this.owner = user;
		user.destroyRole('room.admin');
		user.upgradeRole('room.owner');
		lobby.emit(user, 'room-owner-change', {room: this.exportAsItem()});
		//this.emit(this.owner, 'room-change', {room: this.exportAsItem()});

		return this;
	}

	/**
	 * Returns if user is a lobby moderator or administrator
	 *
	 * @param  {User}       user    User to check
	 * @return {Boolean}            If roles are present
	 */
	isModeratorPlus(user) {
		return user.hasRole('room.moderator') || this.isAdmin(user);
	}

	/**
	 * Returns if the user is a lobby moderator
	 *
	 * @param  {User}       user    User to check
	 * @return {Boolean}            If roles are present
	 */
	isModerator(user) {
		return user.hasRole('room.moderator');
	}

	/**
	 * Returns whether user instance is an admin
	 * @param {User} user    User instance
	 */
	isAdmin(user) {
		return (
			this.isUserPresent(user) &&
			(user.role === 'room.admin' || user.role === 'room.owner')
		);
	}

	/**
	 * Returns whether user instance is a room member
	 * @param {User} user    User instance
	 */
	isMember(user) {
		return this.isUserPresent(user) && user.role === 'room.member';
	}

	/**
	 * Gives admin privileges to target
	 * @param {User} user      User instance to grant admin privileges
	 * @param {User} target    User instance to receive admin privileges
	 */
	setAdmin(user, target) {

		this.lastActive = Date.now();

		target = lobby.getUser(target);

		if (!target) {
			throw new Error('Target must be an existing user');
		}

		if (this.isOwner(target)) {
			throw new Error('An owner is always an admin');
		}

		if (!this.isUserPresent(target)) {
			throw new Error('User must be in the room to become a room admin');
		}

		if (this.isMember(user)) {
			throw new Error('A room member cannot change admin privileges');
		}

		if (this.isAdmin(target)) {
			throw new Error('Already an admin');
		}

		target.upgradeRole('room.admin');
		lobby.emit(target, 'room-change', {room: this.exportAsItem()});

		return this;
	}

	/**
	 * Removes admin priveleges from target user.
	 * @param {User} user     User instance
	 * @param {User} target   User target
	 */
	unsetAdmin(user, target) {

		this.lastActive = Date.now();

		target = lobby.getUser(target);

		if (!target) {
			throw new Error('Target must be an existing user');
		}

		if (this.isOwner(target)) {
			throw new Error('An owner is always an admin');
		}

		if (!this.isUserPresent(target)) {
			throw new Error('User must be in the room to remove admin privileges');
		}

		if (!(this.isOwner(user) || this.isAdmin(user))) {
			throw new Error('A room member cannot change admin privileges');
		}

		if (!this.isAdmin(target)) {
			throw new Error('Already a member');
		}

		target.destroyRole('room.admin');
		lobby.emit(target, 'room-change', {room: this.exportAsItem()});

		return this;
	}

	/**
	 * Allows the user to join the room
	 * @param {User}      user        User to join
	 * @param {string}    password    Password attempt to server
	 */
	join(user, passphrase) {

		this.lastActive = Date.now();

		if (!passphrase && this.passphrase) {
			throw new Error('This room is locked and requires a passphrase');
		}

		if (passphrase != this.passphrase && this.passphrase) {
			throw new Error('Unable to join room. The passphrase is invalid');
		}

		user = lobby.getUser(user);

		if (!user) {
			throw new Error('User is not a member of the lobby');
		}

		if (user.room) {
			if (user.room.id !== this.id) {
				throw new Error('You cannot join a room whilst in another');
			} else if (user.room.id === this.id) {
				throw new Error('You\'re already in the room');
			}
		}

		this.users.push(user);
		user.room = this;
		user.upgradeRole('room.member');

		if (this.joinRole === 'room.admin') {
			user.upgradeRole('room.admin');
		}

		lobby.emit(user, 'room-join', {room: this.exportAsItem()});
		lobby.emit(user, 'user-relocated', {user: user, room: this.exportAsItem()});

		return this;
	}

	/**
	 * Allows a user to leave the room
	 * @param {User} user        User instance
	 * @param {string} code      Leaving code
	 * @param {string} reason    Reason for leaving
	 */
	leave(user, code, reason) {
		this.lastActive = Date.now();

		user = lobby.getUser(user);

		if (!user) {
			throw new Error('User is not a member of the lobby');
		}

		if (!this.isUserPresent(user)) {
			throw new Error('User must be in the room in order to leave it');
		}

		var owner = this.isOwner(user);

		this.users = this.users.filter((e) => e.id !== user.id);

		user.room = null;
		user.destroyRole('room.owner');
		user.destroyRole('room.admin');
		user.destroyRole('room.member');

		if (!code || code === 'peaceful') {
			lobby.emit(user, 'room-leave', {room: this.exportAsItem()});
		} /* else if code === 'quiet' || 'kick', etc */

		// A room must close if we are the only user or there's no one left
		var mustClose = (owner && this.ownerLeaveAction == 'close') || this.users.length == 0;

		if (mustClose) {
			if (this.users.length > 0) {
				this.close(this, 'owner-left', 'The owner left the room');
			} else {
				this.close(this, 'room-empty', 'The room is empty');
			}
		} else {
			if (owner && this.ownerLeaveAction == 'assign-first') {
				this.setOwner(this.users[0]);
			} else if (owner) {
				throw new Error('Unable to set new owner');
			}
		}

		return this;
	}

	/**
	 * Closes the server
	 * @param {User|Room|Lobby}    referer    Referencing instance
	 * @param {string}             code       Code closure id
	 * @param {strng}              reason     Reason for closure
	 */
	close(referer, code, reason) {

		if (!referer) {
			throw new Error('Referer is required');
		}

		var type = Utils.getType(referer);

		if (!(type == 'User' || type == 'Room')) {
			throw new Error('Invalid Referer');
		} else if (type == 'User' && !(this.isOwner(referer) || this.isAdmin(referer))) {
			throw new Error('Only admins can close a room');
		} else if (type == 'Room' && referer.id !== this.id) {
			throw new Error('Another room cannot perform this action');
		}

		lobby.emit(this, 'room-close', {code: code, reason: reason, room: this.exportAsItem()});

		this.users.forEach((e) => this.leave(e, code, reason));

		this.closed = true;

		if (lobby.hasRoom(this)) {
			lobby.removeRoom(this);
		}

		return this;
	}

	isClosed() {
		return this.closed;
	}

	/**
	 * Kicks a user from the room, along with the reason
	 * @param {User}      user      User to kick
	 * @param {string}    reason    Reason for user kick
	 */
	kickUser(user, reason) {

		if (!this.isUserPresent(user)) {
			throw new Error('Can only kick room users');
		}

		this.leave(user, 'kick');

		lobby.emit(user, 'room-kick', {reason: reason, room: this.exportAsItem()});

		return this;
	}

	/**
	 * Message everyone in the room.
	 *
	 * @param {Message}      message    Message to send
	 * @param {User[]|User}  exclude    Users to exclude
	 */
	message(message, exclude) {

		this.lastActive = Date.now();

		if (!Utils.getType(message, 'Message')) {
			throw new Error('Invalid message type');
		}

		if (Utils.isType(exclude, 'User')) {
			exclude = [exclude];
		}

		exclude = exclude || [];

		if (!Utils.isType(exclude, 'Array')) {
			throw new Error(`Cannot exclude users from message with type '${Utils.getType(exclude)}'`);
		}

		if (!Utils.getType(message.getSender(), 'User')) {
			throw new Error('Message requires a sender');
		}

		message.setReceiver(null);
		message.setType('room');

		var users = this.users.filter((e) => !~exclude.indexOf(e));
		message.sendTo(users);

		return this;
	}

	/**
	 * Notify everyone in the room.
	 *
	 * @param {Notification} notification    Notification message
	 * @param {User[]|User}  exclude         Users to exclude
	 */
	notify(notification, exclude) {

		this.lastActive = Date.now();

		if (!Utils.isType(notification, 'Notification')) {
			throw new Error('Invalid notification type');
		}

		if (Utils.isType(exclude, 'User')) {
			exclude = [exclude];
		}

		exclude = exclude || [];

		if (!Utils.isType(exclude, 'Array')) {
			throw new Error(`Cannot exclude users from notification with type '${Utils.getType(exclude)}'`);
		}

		var users = this.users.filter((e) => !~exclude.indexOf(e));
		notification.sendTo(users);

		return this;
	}

}

module.exports = Room;