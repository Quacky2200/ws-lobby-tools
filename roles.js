module.exports = function() {
	// ========================================================================
	// Roles
	// ========================================================================
	if (this.roles) {
		if (!(
			typeof(this.roles) == 'object' &&
			this.roles.constructor.name === 'object'
		)) {
			this.roles = 0;
		}
	}
	this.roles = this.roles || {};

	/**
	 * Sets roles, this must never be accessible on a web socket!
	 *
	 * @param array  value  Potential roles for clients to use
	 */
	this.setRoles = function(value) {
		this.roles = value;
	};

		/**
	 * Sets roles, this must never be accessible on a web socket!
	 *
	 * @returns             Roles
	 */
	this.getRoles = function(value) {
		return this.roles;
	};

	/**
	 * Returns role methods for specific role
	 * @param  string  role    Role name
	 * @return mixed
	 */
	this.getRoleMethods = function(role) {
		var key = role;
		var keys = (key ? key.split('.') : []);
		var temp = this.roles;

		for (var i in keys) {
			var key = keys[i];
			if (!temp[key]) {
				return null;
			}
			temp = temp[key];
		}

		// Make sure methods are in a list, otherwise assume that an object is
		// still describing a role tree (aka, guest, room.owner, etc)
		if (!(typeof(temp) == 'object' && temp.constructor.name == 'Array')) {
			return null;
		}

		return temp;
	};

	/**
	 * Rolls the clients role back to the last if possible.
	 * @return void
	 */
	this.rollbackClientRole = function() {
		if (!this.clientExists(client)) throw new Error('Client doesn\'t exist');

		if (client.props.roleStack.length = 0) {
			// This is the furthest we can go...
			client.props.role = 'guest';
			return;
		}

		client.props.role = client.props.roleStack.pop();
	};


	/**
	 * Changes the current user role in the server.
	 *
	 * @param socket   client    Web socket
	 * @param string   role_id   Role to use
	 */
	this.addClientRole = function(client, role_id) {
		if (!this.clientExists(client)) throw new Error('Client doesn\'t exist');

		if (!this.getRoleMethods(role_id)) {
			// Roles without methods cannot be assigned.
			throw new Error('Invalid role');
		}

		client.props.roleStack.add(client.props.role);

		client.props.role = role_id;
	};

	/**
	 * Returns the role name that the client is assigned to.
	 * @param  string  client     Web Socket
	 * @return string             Name of role
	 */
	this.getClientRole = function(client) {
		return client.props.role;
	};

	/**
	 * Retrieves all the available methods for clients, this can be dangerous to
	 * give away. Keep safe.
	 *
	 * @param  socket  client  Web socket
	 * @param  string  key     Role key if needed (optional)
	 * @return mixed
	 */
	this.getClientRoleMethods = function(client) {
		return this.getRoleMethods(client.props.role);
	};

	/**
	 * Checks whether access is permitted by the role they are under
	 *
	 * @param  socket   client    Web socket
	 * @param  string   method    Method to test permissions
	 * @return boolean            Access granted when true
	 */
	this.checkRoleAccess = function(client, method) {
		var alwaysAvailable = ['ping', 'pong', 'keep-alive']

		if (~alwaysAvailable.indexOf(method)) {
			return true;
		}

		if (client.props.role) {
			var roles = this.getClientRoleMethods(client);

			return ~roles.indexOf(method);
		}

		return false;
	};
};