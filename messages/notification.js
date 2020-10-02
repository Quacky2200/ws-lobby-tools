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
const Utils = require('../libs/utils');
const {Request} = require('../libs/json-rpc');

class Notification extends Request {
	constructor(code, message, data) {
		super('notify');

		if (Utils.isType(data, 'Array')) {
			data = {data: data};
		}

		this.params = [{
			code: code,
			message: message,
			data: data
		}];
	}
}

module.exports = Notification;