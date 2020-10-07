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
const uuidv4 = require('uuid/v4');
const cats = require('cat-names');
const dogs = require('dog-names');
const heroes = require('superheroes');
const villains = require('supervillains');
const Generator = require('id-phrase-generator');

let count = {}; // autoincrement
let phrases = new Generator({numbers: false, determiners: false});
var debug = process.env.DEBUG || true;

class Utils {

	static debug(...args) {
		if (debug) {
			console.log.apply(console, args);
		}
	}

	/**
	 * Formats a string which can use curly brace {n} placeholders
	 * @param {string}  str    Unformatted string
	 * @param  {...any} args   Arguments to insert into placeholders
	 */
	static format(str, ...args) {
		var remainder = str;

		var built = '';
		var match = null;
		while (match = remainder.match(/(?:[^\\]|^)\{(\d)\}/)) {
			var length = match.index + match[0].length;
			var take = remainder.slice(0, length);
			var tag = `{${match[1]}}`;
			built += take.replace(tag, args[match[1]] || tag);
			remainder = remainder.slice(length);
		}

		if (remainder.length > 0) {
			built += remainder;
		}

		return built;
	}

	/**
	 * Checks variable for type comparison without the need for long type
	 * checking if statements (e.g. typeof() && constructor.name)
	 * @param {any} obj           Object to check type against
	 * @param {any} comparator    Comparison type or object
	 */
	static isType(obj, comparator) {
		var _type = null;
		var _complex = null;

		if (typeof(comparator) == 'object') {
			// Compare to another object instance
			_type = 'object';
			_complex = type.constructor.name;
		} else if (typeof(comparator) === 'string') {
			switch (comparator.toLowerCase()) {
				case 'string':
					_type = 'string';
					break;
				case 'number':
				case 'integer':
				case 'float':
				case 'decimal':
					_type = 'number';
					break;
				case 'bool':
				case 'boolean':
					_type = 'boolean';
					break;
				case 'func':
				case 'function':
					_type = 'function';
					break;
				case 'array':
					_type = 'object';
					_complex = 'Array';
					break;
				default:
					_type = 'object';
					_complex = comparator;
			}
		} else {
			throw new Error('Invalid type parameter');
		}

		if (_type == 'object') {
			return typeof(obj) == _type && obj && obj.constructor.name === _complex;
		} else {
			return typeof(obj) == _type;
		}
	}

	/**
	 * Quickly checks the type without comparator checks.
	 *
	 * See {@link Utils.isType} function body for more information.
	 *
	 * Checks variable for type comparison without the need for long type
	 * checking if statements (e.g. typeof() && constructor.name).
	 *
	 * @param {any}    obj           Object to check type against
	 * @param {string} comparator    Comparison type or object
	 */
	static isTypeQuick(obj, comparator) {
		return this.getType(obj).toLowerCase() === comparator.toLowerCase();
	}

	static getType(obj) {
		if (typeof(obj) === 'object') {
			return obj.constructor.name || 'Object';
		} else {
			return typeof(obj);
		}
	}

	/**
	 * Creates a random string of character.
	 *
	 * @param  number  length       Length of generated string
	 * @param  string  characters   Characters to use in string generation
	 * @return string               Generated characters
	 */
	static randomStr(length, characters) {
		characters = characters || "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		length = length || 10;
		var str = "";
		for (var i = 0; i < length; i++) {
			str += characters[this.randomInt(0, characters.length)];
		}

		return str;
	}

	/**
	 * Creates a random number. Inclusive min, exclusive max.
	 * @param  number  min  Start number
	 * @param  number  max  End number
	 * @return number       The random number
	 */
	static randomInt(min, max) {
		// Generate a random string of uppercase and lowercase letters including numbers 0-9.
		// Can be used to create seeds/ID"s etc etc
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min)) + min;
	}

	/**
	 * Creates a random ID of a selected type/range.
	 *
	 * Using type count/increment gives you a straight forward incremental id,
	 * giving a key will allow you to have multiple counters.
	 *
	 * @param  string  type    Kind of randomiser
	 * @param  string  key     Counter id for increment/count type
	 * @return string          random generated string
	 */
	static createID(type, key) {

		type = type || 'default';
		key = key || 'unassigned';

		switch (type) {
			case 'default':
			case 'heroes':
				return heroes.random();
			case 'villains':
				return villains.random();
			case 'cats':
				return cats.random();
			case 'dogs':
				return dogs.random();
			case 'guid':
			case 'uuid4':
				return uuidv4();
			case 'phrase':
			case 'phrases':
				return phrases.next();
			case 'random-string':
				return this.randomStr();
			case 'random-int':
				return this.randomInt(0, 100);
			case 'random':
				return Math.random();
			case 'count':
			case 'increment':
				if (!count[key]) {
					count[key] = 0;
				}

				return ++count[key];
			default:
				throw new Error('Unknown ID type');
		}
	}

	/**
	 * Sets an object's value using a dot-notation key
	 *
	 * If the object is not a true object, or the key is not a valid string, we
	 * will return false.
	 *
	 * @param   {object} obj       Object to set value
	 * @param   {string} key       Object key(s)
	 * @param   {mixed}  value     Value to set
	 * @returns {object}           Object with modified KVP
	 */
	static setObjectValue(obj, key, value) {
		if (!(obj && typeof(obj) == 'object')) return false;
		if (typeof(key) != 'string') return false;
		var namespaces = key.split(".");
		var namespace = obj;
		var key;
		while (key = namespaces.shift()) {
			if (!(
				namespace.hasOwnProperty(key) &&
				namespace[key] &&
				typeof(namespace[key]) == 'object'
			)) namespace[key] = {};

			if (namespaces.length == 0) {
				namespace[key] = value;
				break;
			}
			namespace = namespace[key];
		}
		return obj;
	}

	/**
	 * Retrieves an object's value using a dot-notation key
	 *
	 * If the object is not a true object, or the key is not a string, we will
	 * return false or the default value.
	 *
	 * @param   {object} obj             Object to set value
	 * @param   {string} key             Object key(s)
	 * @param   {mixed}  defaultValue    Value if key doesn't exist
	 * @return  {mixed}                  Value from key
	 */
	static getObjectValue(obj, key, defaultValue = null) {
		if (!(obj && typeof(obj) == 'object')) return false || defaultValue;
		if (typeof(key) != 'string') return false;
		var namespaces = key.split(".");
		var namespace = obj;
		for (var idx in namespaces) {
			var key = namespaces[idx];
			if (!namespace.hasOwnProperty(key)) return defaultValue;
			namespace = namespace[key];
		}
		return namespace;
	}

	/**
	 * Checks whether an object's key is present using a dot-notation key
	 *
	 * If the object is not a true object, we will return false.
	 *
	 * @param   {object} obj             Object to set value
	 * @param   {string} key             Object key(s)
	 * @return  {mixed}                  Value from key
	 */
	static hasObjectKey(obj, key) {
		if (!(obj && typeof(obj) == 'object')) return false;
		var namespaces = key.split(".");
		var namespace = obj;
		for (var idx in namespaces) {
			var key = namespaces[idx];
			if (!namespace.hasOwnProperty(key)) return false;
			namespace = namespace[key];
		}
		return true;
	}
}

module.exports = Utils;