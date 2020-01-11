module.exports = function() {
	// ========================================================================
	// Methods
	// ========================================================================
	if (this.methods) {
		if (!(
			typeof(this.methods) == 'object' &&
			this.methods.constructor.name === 'object'
		)) {
			this.methods = 0;
		}
	}
	this.methods = this.methods || {};

	/**
	 * Sets the current methods allowed by the web socket server, never allow
	 * clients to access this. Keep safe.
	 *
	 * @param mixed   value   Method description
	 */
	this.setMethods = function(value) {
		this.methods = value;
	};

	/**
	 * Returns all of the methods available on the server. Never allow clients
	 * to access this. Keep safe.
	 *
	 * @return mixed
	 */
	this.getMethods = function() {
		return this.methods;
	};

	/**
	 * Attempts to run a method with the current web socket and data message
	 *
	 * @param  object  event    Message Event
	 * @param  mixed    data    Message received
	 * @return void
	 */
	this.tryMethod = function(event, data) {
		var client = event.sender;

		switch (data.method) {
			// repeated below in-case this function isn't called.
			case 'keep-alive':

				// no need to send anything here
				client.props.heartbeatPulse = true;

				return;
			case 'pong':

				// Never respond to pongs
				return;
			case 'keep-alive?':

				// Never respond to our own message signature
				return;
			case 'ping':

				this.pong(client, data);

				return;
			default:

				var result, error;

				try {

					if (
						this.methods.hasOwnProperty(data.method) &&
						typeof(this.methods[data.method]) == 'function'
					) {
						var args = [event].concat(data.params);

						result = this.methods[data.method].bind(this).apply(this, args);
					} else {
						throw new Error('Command is not available');
					}

				} catch (e) {
					console.log('An error was thrown during method invocation:\n', e);
					error = {message: e.message, code: 'error'};
				}

				return {id: data.id, error: error, result: result};
		}
	};
};