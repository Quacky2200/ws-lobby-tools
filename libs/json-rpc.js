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
const Utils = require('./utils');

class Sendable {

	export() {
		return JSON.stringify(this);
	}

	import(str) {
		try {
			var obj = JSON.parse(str);
			var banned = ['import', 'export', 'sendTo', 'isValid'];
			for(var i in obj) {
				// Skip banned keys
				if (~banned.indexOf(i)) continue;
				this[i] = obj[i];
			}
			return this;
		} catch (e) {
			// Fail without message.
		}

		return null;
	}

	isValid() {
		// Has to be implemented by other classes
		return false;
	}

	sendTo(users) {
		if (Utils.isType(users, 'User')) {
			users = [users];
		}

		if (!Utils.isType(users, 'Array')) {
			throw new Error(`Expected a list of users or a user, but received '${Utils.getType(users)}'`);
		}

		for (var i in users) {
			var user = users[i];

			if (typeof(user.send) == 'function') {
				if (this.method) {
					// Automatically increment message IDs for Requests
					this.id = ++user.messageID;
				}
				user.send(this.export());
			} else {
				throw new Error('User is missing it\'s own send function');
			}
		}
	}
}

class Request extends Sendable {
	constructor(method, params) {
		super();
		this.id = -1;
		this.method = method;
		this.params = params || [];
		this.jsonrpc = 2.0;
	}

	isValid() {
		var props = ['id', 'method', 'params', 'jsonrpc'];
		for (var i in props) {
			if (!this.hasOwnProperty(props[i])) {
				return false;
			}
		}

		return (
			this.id >= 0 &&
			this.jsonrpc == 2.0 && (
				typeof(this.params) == 'object' &&
				this.params.constructor.name == 'Array'
			)
		);
	}

	static import(str) {
		var obj = new this();
		obj.import(str);
		if (!obj.isValid()) return null;
		return obj;
	}
}

class Response extends Sendable {

	constructor(id, error, result) {
		super();
		this.id = id;
		this.error = error || null;
		this.result = result || null;
		this.jsonrpc = 2.0;
	}

	isValid() {
		var props = ['id', 'error', 'result', 'jsonrpc'];
		for (var i in props) {
			if (!this.hasOwnProperty(props[i])) {
				return false;
			}
		}

		return obj.jsonrpc == 2.0;
	}

	static import(str) {
		var obj = new this();
		obj.import(str);
		if (!obj.isValid()) return null;
		return obj;
	}
}

module.exports = {
	// Prototypes
	Sendable: Sendable,
	// Classes
	Request: Request,
	Response: Response
};