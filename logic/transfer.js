'use strict';

var constants = require('../helpers/constants.js');
var bignum = require('../helpers/bignum.js');

// Private fields
var modules, library;

/**
 * Main transfer logic.
 * @memberof module:transactions
 * @class
 * @classdesc Main transfer logic.
 */
// Constructor
function Transfer (logger, schema) {
	library = {
		logger: logger,
		schema: schema,
	};
}

// Public methods
/**
 * Binds input parameters to private variable modules.
 * @param {Accounts} accounts
 * @param {Rounds} rounds
 */
Transfer.prototype.bind = function (accounts, rounds) {
	modules = {
		accounts: accounts,
		rounds: rounds,
	};
};

/**
 * Assigns data to transaction recipientId and amount and transfer asset.
 * @param {Object} data
 * @param {transaction} trs
 * @return {transaction} trs with assigned data
 */
Transfer.prototype.create = function (data, trs) {
	trs.recipientId = data.recipientId;
	trs.amount = data.amount;
	trs.asset.data = data.data || null;

	return trs;
};

/**
 * Returns send fees from constants for transactions without asset and send fees + data fees if asset exists.
 * @param {transaction} trs
 * @param {account} sender
 * @return {number} fee
 */
Transfer.prototype.calculateFee = function (trs, sender) {
	var fee = new bignum(constants.fees.send);
	if (trs.asset && trs.asset.data) {
		fee = fee.plus(constants.fees.data);
	}

	return Number(fee.toString());
};

/**
 * Verifies recipientId and amount greather than 0.
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} errors | trs
 */
Transfer.prototype.verify = function (trs, sender, cb) {
	if (!trs.recipientId) {
		return setImmediate(cb, 'Missing recipient');
	}

	if (trs.amount <= 0) {
		return setImmediate(cb, 'Invalid transaction amount');
	}

	return setImmediate(cb, null, trs);
};

/**
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb, null, trs
 */
Transfer.prototype.process = function (trs, sender, cb) {
	return setImmediate(cb, null, trs);
};

/**
 * Creates a buffer with asset.transfer.data.
 * @param {transaction} trs
 * @return {Array} Buffer
 * @throws {e} error
 */
Transfer.prototype.getBytes = function (trs) {
	var buf;
	var data;

	if (trs.asset && trs.asset.data) {
		data = trs.asset.data;
	}

	try {
		buf = data ? Buffer.from(data, 'utf8') : null;
	} catch (e) {
		throw e;
	}

	return buf;
};

/**
 * Calls setAccountAndGet based on transaction recipientId and
 * mergeAccountAndGet with unconfirmed trs amount.
 * @implements {modules.accounts.setAccountAndGet}
 * @implements {modules.accounts.mergeAccountAndGet}
 * @implements {modules.rounds.calc}
 * @param {transaction} trs
 * @param {block} block
 * @param {account} sender
 * @param {function} cb - Callback function
 * @return {setImmediateCallback} error, cb
 */
Transfer.prototype.apply = function (trs, block, sender, cb) {
	modules.accounts.setAccountAndGet({address: trs.recipientId}, function (err, recipient) {
		if (err) {
			return setImmediate(cb, err);
		}

		modules.accounts.mergeAccountAndGet({
			address: trs.recipientId,
			balance: trs.amount,
			u_balance: trs.amount,
			blockId: block.id,
			round: modules.rounds.calc(block.height)
		}, function (err) {
			return setImmediate(cb, err);
		});
	});
};

/**
 * Calls setAccountAndGet based on transaction recipientId and
 * mergeAccountAndGet with unconfirmed trs amount and balance negative.
 * @implements {modules.accounts.setAccountAndGet}
 * @implements {modules.accounts.mergeAccountAndGet}
 * @implements {modules.rounds.calc}
 * @param {transaction} trs
 * @param {block} block
 * @param {account} sender
 * @param {function} cb - Callback function
 * @return {setImmediateCallback} error, cb
 */
Transfer.prototype.undo = function (trs, block, sender, cb) {
	modules.accounts.setAccountAndGet({address: trs.recipientId}, function (err, recipient) {
		if (err) {
			return setImmediate(cb, err);
		}

		modules.accounts.mergeAccountAndGet({
			address: trs.recipientId,
			balance: -trs.amount,
			u_balance: -trs.amount,
			blockId: block.id,
			round: modules.rounds.calc(block.height)
		}, function (err) {
			return setImmediate(cb, err);
		});
	});
};

/**
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
Transfer.prototype.applyUnconfirmed = function (trs, sender, cb) {
	return setImmediate(cb);
};

/**
 * @param {transaction} trs
 * @param {account} sender
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
Transfer.prototype.undoUnconfirmed = function (trs, sender, cb) {
	return setImmediate(cb);
};


/**
 * @typedef {Object} transfer 
 * @property {String} data
 */
Transfer.prototype.schema = {
	id: 'transefer',
	type: 'object',
	properties: {
		data: {
			type: 'string',
			minLength: 0,
			maxLength: 64
		}
	}
};

/**
 * Deletes blockId from transaction, and validates schema if asset exists
 * @param {transaction} trs
 * @return {transaction}
 */
Transfer.prototype.objectNormalize = function (trs) {
	delete trs.blockId;

	if (trs.asset.data === null || typeof trs.asset.data === 'undefined') {
		delete trs.asset.data;
	}

	var report = library.schema.validate(trs.asset, Transfer.prototype.schema);

	if (!report) {
		throw 'Failed to validate transfer schema: ' + library.schema.getLastErrors().map(function (err) {
			return err.message;
		}).join(', ');
	}

	return trs;
};

Transfer.prototype.dbTable = 'transfer';

Transfer.prototype.dbFields = [
	'data',
	'transactionId'
];


/**
 * checks if asset exists, if so, returns value otherwise returns null
 * @param {Object} raw
 * @return {null}
 */
Transfer.prototype.dbRead = function (raw) {
	var data = raw.tf_data || null;
	return {data: data};
};

/**
 * checks if asset exists, if so, returns transfer table promise otherwise returns null
 * @param {transaction} trs
 * @return {Object} {table:signatures, values: publicKey and transaction id} or null.
 */
Transfer.prototype.dbSave = function (trs) {
	if (trs.asset && trs.asset.data) {
		var data;

		try {
			data = Buffer.from(trs.asset.data, 'utf8');
		} catch (e) {
			throw e;
		}

		return {
			table: this.dbTable,
			fields: this.dbFields,
			values: {
				data : data,
				transactionId: trs.id
			}
		};
	}

	return null;
};


/**
 * Checks sender multisignatures and transaction signatures.
 * @param {transaction} trs
 * @param {account} sender
 * @return {boolean} True if transaction signatures greather than 
 * sender multimin or there are not sender multisignatures.
 */
Transfer.prototype.ready = function (trs, sender) {
	if (Array.isArray(sender.multisignatures) && sender.multisignatures.length) {
		if (!Array.isArray(trs.signatures)) {
			return false;
		}
		return trs.signatures.length >= sender.multimin;
	} else {
		return true;
	}
};

// Export
module.exports = Transfer;
