var namegen = require('./namegen');
var generic = require('./generic');
var methods = require('./methods');
var clients = require('./clients');
var rooms = require('./rooms');
var roles = require('./roles');


/**
 * WebSocket tools to create a Lobby system.
 *
 * This entails making the communication as fast and automated as possible.
 *
 * This includes:
 * - One stop format using json-rpc: method, params and msg id
 *
 * - Creating, modifiying and closing rooms
 *
 * - Roles in and outside of rooms - this allows permissions to be created for
 *   more control, this can help moderate games, chat clients, etc. It's up to
 *   the developer on how methods and roles are used to control this
 *
 * - Relaying information inside rooms when it is time critical per application
 *
 * - Unique name generation (as per usual)
 *
 * - Easily extensible, simply replace & extend functionality where needed
 *
 * - Attempting to make it as fast as possible between clients so that less time
 *   is used identifying clients, or handling messageclient. In such cases, this
 *   will likely increase memory usage as a tradeoff
 *
 * - Plugable methods and roles means that functionality is not just limited to
 *   rooms/messages by default
 *
 * - separate ping/pong and heartbeat functionality
 *
 * =============================================================================
 * Note: Note all methods contain client/data parameters. This means that all
 * methods that you want to use must be included separately in this.methods.
 *
 * Whilst this is unfortunate, it makes sure that only the bare functionality is
 * present by re-introducing it. Please also note that this may not be finished.
 *
 * A refactor could probably help prevent this.
 * =============================================================================
 *
 * @type {Object}
 */

var debug = process.env.DEBUG || false;

module.exports = (new function() {

	// ========================================================================
	// Generic functions
	// ========================================================================

	/**
	 * Debugging function for verbosity
	 * @return void
	 */
	this.debug = function() {
		if (debug) {
			console.log.apply(console, arguments);
		}
	};

	namegen.bind(this)();
	generic.bind(this)();
	clients.bind(this)();
	rooms.bind(this)();
	roles.bind(this)();
	methods.bind(this)();

	/**
	 * Current default handler that (should) ideally be used for these projects,
	 * allowing a lot of manual work to be automated.
	 *
	 * @param  socket   client   Web socket
	 * @param  mixed    data     Message received
	 * @return void
	 */
	this.handleData = function(client, data) {
		var relay = data.slice(0, 5) == 'relay';

		if (relay && client.props.relay && client.props.room) {
			this.debug('> (???)', data);

			// Try and relay as fast as possible...
			this.broadcast(data.slice(0, 6), this.getClientsInRoom(client.props.room), client);

			return;
		} else if (relay && !client.props.relay && client.props.room) {

			this.sendError(client, 'action-unauthorised', 'This room has not been setup to relay');

			return;
		} else if (relay && !client.props.relay && !client.props.room) {

			this.sendError(client, 'action-unauthorised', 'You can\'t relay information outside of a room');

			return;
		} /* else { [see below] } */

		var old = data;
		var data = this.tryParse(data);

		if (data) {

			// Event sender args as our own
			var event = {
				sender: client,
				data: data,
				origin: null,
				created: Date.now()
			};

			// Only do these actions on requests
			if (data.method) {

				this.debug('> (req)', old);

				if (this.checkRoleAccess(client, data.method)) {

					this.debug('>>', data.method, 'as', client.props.role);

					var res = this.handleReq(event, data);

					if (res) {

						if (res.error) {
							this.debug('<<!', res.error.message);
						} else {
							this.debug('<< ', res.result);
						}

					}

				} else {

					this.debug('>!', data.method, 'as', client.props.role, '- unauthorised');

					this.sendError(client, 'role-unauthorised', 'Your current role prevents this action');

				}
			} else {
				this.debug('> (res)', old);

				this.handleRes(event, data);
			}

		} else {

			this.debug('>!', 'Invalid message:', old);

			this.sendError(client, 'message-invalid', 'An invalid message was sent');
		}

	};

}());