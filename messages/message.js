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
const {Request} = require('../libs/json-rpc');

class Message extends Request {
	constructor(sender, receiver, message) {
		super('message', [{
			content: message,
			from: sender.exportAsItem(),
			date: Date.now(),
			for: (receiver ? receiver.exportAsItem() : null),
		}]);
	}

	getType() {
		return this.params[0].type;
	}

	setType(type) {
		this.params[0].type = type;
	}

	getContent() {
		return this.params[0].content;
	}

	setContent(content) {
		return this.params[0].content = content;
	}

	getSender(sender) {
		return this.params[0].from;
	}

	setSender(sender) {
		this.params[0].from = (sender ? sender.exportAsItem() : null);
	}

	getReceiver() {
		return this.params[0].for;
	}

	setReceiver(receiver) {
		this.params[0].for = (receiver ? receiver.exportAsItem() : null);
	}
}

module.exports = Message;