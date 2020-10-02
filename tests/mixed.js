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
const Lobby = require('./lobby');
const User = require('./user');
const Room = require('./room');
const {Notification, Message} = require('./messages');
var lobby = Lobby.instance();

lobby.stopExpiryCollector();


describe('Users', function() {

});

describe('Rooms', function() {

});

describe('Lobby', function() {

})

var u = new User();
lobby.addUser(u);

var r = new Room(u);
lobby.addRoom(r);
//r.join(u);

r.message(new Message(u, r, 'This is a test message!'));

console.log('getUserList() -', lobby.getUserList());
console.log('getRoomList() -', lobby.getRoomList());

lobby.removeRoom(r);

lobby.notify(new Notification('another-test', 'This is a test', {date1: Date.now()}));
lobby.message(new Message(u, null, 'A lobby test message'));

//lobby.removeUser(u);

u.leave();

//console.log(Utils.format('This is {1} {0} test \\{0}', 'hello', 'world'));