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
var assert = require('assert');

describe('Utils', function() {

	describe('Misc.', function() {
		it('format()', function() {
			assert.equal(Utils.format('{0}, {1}.', 'hello', 'world'), 'hello, world.');
			assert.equal(Utils.format('{0}, {1}.', 'hello{1}', 'world'), 'hello{1}, world.');
		});
	})

	describe('Random id generation', function() {
		it('createID(\'count\')', function() {
			assert.equal(Utils.createID('count'), 1)
			assert.equal(Utils.createID('count'), 2)
			assert.equal(Utils.createID('count'), 3)
		});

		it('createID(\'count\', \'another\')', function() {
			assert.equal(Utils.createID('count', 'another'), 1)
			assert.equal(Utils.createID('count', 'another'), 2)
			assert.equal(Utils.createID('count', 'another'), 3)
		});

		it('randomInt()', function() {
			assert.notEqual([0,1,2,3,4].indexOf(Utils.randomInt(0, 5)), -1);
		});

		it('randomStr()', function() {
			var str = Utils.randomStr();
			assert.equal(typeof(str), 'string');
			assert.equal(!!str.match(/[A-Za-z0-9]+/), true);
			assert.equal(str.length, 10);
			assert.equal(!!Utils.randomStr(5, '123456789-=').match(/[\d\-\=]+/), true);
		});

		it('createID()', function() {
			assert.equal(!!Utils.createID(), true);

			var error;
			try {
				Utils.createID('unknown');
			} catch (e) {
				error = e.message;
			} finally {
				assert.equal(error, 'Unknown ID type', 'createID doesn\'t throw on unknown identifier');
			}
		});

		it('createID(\'phrase\')', function() {
			assert.equal(!!Utils.createID('phrase').match(/(\w+\-)+/), true);
		});
	})

	describe('Type checking', function() {
		it('isType()', function() {
			assert.equal(Utils.isType(1, 'number'), true);
			assert.equal(Utils.isType(1, 'string'), false);
			assert.equal(Utils.isType(true, 'bool'), true);
		});

		it('isTypeQuick()', function() {
			assert.equal(Utils.isTypeQuick(1, 'number'), true);
			assert.equal(Utils.isTypeQuick(1, 'string'), false);
			assert.equal(Utils.isTypeQuick(true, 'bool'), false);
		});

		it('getType()', function() {
			assert.equal(Utils.getType({}), 'Object');
			assert.equal(Utils.getType(1), 'number');
			assert.equal(Utils.getType(false), 'boolean');
			assert.equal(Utils.getType(() => {}), 'function');
			assert.equal(Utils.getType(''), 'string');
		});
	});

	describe('Dot Notation Object Getter/Setter', function() {
		var obj = {hello: {world: 42}};

		it('hasObjectKey()', function() {
			assert.equal(Utils.hasObjectKey(obj, 'hello.world'), true);
			assert.equal(Utils.hasObjectKey(obj, 'hello'), true);
			assert.equal(Utils.hasObjectKey(obj, 'hello.world.42'), false);
			assert.equal(Utils.hasObjectKey(obj, 'goodbye.world'), false);
			assert.equal(Utils.hasObjectKey(false, 'hello.world'), false);
		});

		it('getObjectValue()', function() {
			assert.equal(Utils.getObjectValue(obj, 'hello.world', 41), 42);
			assert.equal(Utils.getObjectValue(obj, 'hello-world', 41), 41);
			assert.equal(Utils.getObjectValue(obj, 'hello-world'), null);
			assert.equal(Utils.getObjectValue(false, 'hello-world', ), null);
		});

		it('setObjectValue()', function() {
			assert.deepEqual(Utils.setObjectValue(obj, 'hello', false), {hello: false});
			assert.deepEqual(Utils.setObjectValue(obj, 'hello.world', 42), {hello: {world: 42}});
			assert.equal(Utils.setObjectValue(true, 'hello.world'), false);
			assert.deepEqual(Utils.setObjectValue(obj, 'hello.world'), {hello: {world: null}});
		});
	});

	// Add more here if necessary...
});