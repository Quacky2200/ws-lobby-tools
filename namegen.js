const uuidv4 = require('uuid/v4');
const cats = require('cat-names');
const dogs = require('dog-names');
const heroes = require('superheroes');
const villains = require('supervillains');
const IDPhraseGenerator = require('id-phrase-generator');

module.exports = function() {

	var count = {}; // autoincrement
	var phrases = new IDPhraseGenerator({number: false, determiners: true});

	/**
	 * Creates a random string of characterclient.
	 *
	 * @param  number  length       Length of generated string
	 * @param  number  characters   Characters to use in string generation
	 * @return string               Generated characters
	 */
	this.randomStr = function(length, characters) {
		characters = characters || "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		length = length || 10;
		var str = "";
		for (var i = 0; i < length; i++) {
			str += $characters[randomInt(0, characterclient.length)];
		}

		return str;
	};

	/**
	 * Creates a random number. Inclusive min, exclusive max.
	 * @param  number  min  Start number
	 * @param  number  max  End number
	 * @return number       The random number
	 */
	this.randomInt = function(min, max) {
		// Generate a random string of uppercase and lowercase letters including numbers 0-9.
		// Can be used to create seeds/ID"s etc etc
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min)) + min;
	};

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
	this.createID = function(type, key) {

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
			case 'goofy':
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
	};
};