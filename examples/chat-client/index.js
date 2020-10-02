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
const path = require('path');
const debug = require('debug')('chat-client:main');

const express = require('express');

const app = express();
const net = require('net');
const http = require('http');

const WebSocket = require('ws');

const {Lobby, User} = require('../../index');
const {Notification} = require('../../messages');

const lobby = Lobby.instance();

var servers = {
	websocket: new WebSocket.Server({ noServer: true, clientTracking: false }),
	tcpsocket: new net.Server(lobby.createUser),
	http: http.createServer(app)
};

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * Source: https://github.com/o-klp/hsl_rgb_converter/blob/master/converter.js0
 *
 * @param   {number}  hue           The hue
 * @param   {number}  saturation    The saturation
 * @param   {number}  lightness     The lightness
 * @return  {Array}                 The RGB representation
 */
var hslToRgb = function(hue, saturation, lightness){
	if (hue == undefined) {
		return [0, 0, 0];
	}

	hue = 360 * hue;

	var chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
	var huePrime = hue / 60;
	var secondComponent = chroma * (1 - Math.abs((huePrime % 2) - 1));

	huePrime = Math.floor(huePrime);
	var red;
	var green;
	var blue;

	if (huePrime === 0) {
		red = chroma;
		green = secondComponent;
		blue = 0;
	} else if (huePrime === 1) {
		red = secondComponent;
		green = chroma;
		blue = 0;
	} else if (huePrime === 2) {
		red = 0;
		green = chroma;
		blue = secondComponent;
	} else if (huePrime === 3) {
		red = 0;
		green = secondComponent;
		blue = chroma;
	} else if (huePrime === 4) {
		red = secondComponent;
		green = 0;
		blue = chroma;
	} else if (huePrime === 5) {
		red = chroma;
		green = 0;
		blue = secondComponent;
	}

	var lightnessAdjustment = lightness - (chroma / 2);
	red += lightnessAdjustment;
	green += lightnessAdjustment;
	blue += lightnessAdjustment;

	return [Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)];
};

User.prototype._exportAsItem = User.prototype.exportAsItem;
User.prototype.exportAsItem = function() {
	var result = this._exportAsItem();
	result.color = this.data.color;
	return result;
};

lobby.on('user-join', function(event, who, data) {
	var random = Math.random().toFixed(2)
	who.data.color = `rgb(${hslToRgb(random, .75, .55)})`;
	console.log('user join: ' + random + ' - ' + who.data.color)
}.bind(this));

lobby.addMethod('is-typing', function(user, val) {
	// Typing notification
	var notification = new Notification(
		"is-typing", null, {user: user.exportAsItem(), typing: val}
	);
	if (user.room) {
		console.log(user.room);
		user.room.notify(notification, [user]);
	} else {
		lobby.notify(notification, [user]);
	}
});

servers.websocket.on('connection', lobby.createUser);

app.use('/', express.static(path.join(__dirname, 'public')));

// HTTP server will upgrade the /endpoint URL as a websocket connection
servers.http.on('upgrade', function upgrade(req, socket, head) {
	if (req.url == '/endpoint') {
		servers.websocket.handleUpgrade(req, socket, head, function(ws) {
			servers.websocket.emit('connection', ws, req);
		});
		return;
	}

	let res = new http.ServerResponse(req)
	res.assignSocket(socket);
	res.on('finish', () => res.socket.destroy());
	app(req, res);
});

var port = process.env.port || 5150;
var ip = process.env.ip || '127.0.0.1';

// HTTP Server, with WS page socket (same port)
servers.http.listen(port, ip);
servers.http.on('error', onError);
servers.http.on('listening', onListening);

// TCP Server
servers.tcpsocket.listen(port + 1, onListening);
servers.tcpsocket.on('error', onError);

/**
 * Event listener for server "error" event.
 */
function onError(error) {
	if (error.syscall !== 'listen') {
		throw error;
	}

	var bind = (
		typeof port === 'string' ?
		'Pipe ' + port :
		'Port ' + port
	);

	// handle specific listen errors with friendly messages
	switch (error.code) {
		case 'EACCES':
			console.error(bind + ' requires elevated privileges');
			process.exit(1);
			break;
		case 'EADDRINUSE':
			console.error(bind + ' is already in use');
			process.exit(1);
			break;
		default:
			throw error;
	}
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening(...args) {
	var addr = this.address();
	var server;
	for (var idx in servers) {
		if (Object.is(servers[idx], this)) {
			server = idx;
			break;
		}
	}
	var bind = (
		typeof addr === 'string' ?
		'pipe ' + addr :
		'port ' + addr.port
	);
	console.log(`Server "${server}" is listening on ${bind}`);
}
