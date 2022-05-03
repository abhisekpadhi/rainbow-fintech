module.exports = Object.freeze({
    symbols: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz",
    digits: "0123456789",
    userAccountIdMappingTable: 'userAccountIdMapping',
    requestTable: 'userRequest',
    floatingTable: 'floatingCashRequest',
    accountTable: 'userAccount',
    ledgerTable: 'userLedger',
    txnTable: 'userTxn',
    requestType: {
        deposit: 'deposit',
        withdraw: 'withdraw',
        register: 'register',
        collect: 'collect',
        pay: 'pay',
        transfer: 'transfer',
        seeSaved: 'seeSaved',
        sip: 'sip',
        bucket: 'bucket',
        findDeposit: 'findDeposit',
        findWithdraw: 'findWithdraw'
    },
    txnStatus: {
        created: 'created',
        success: 'success',
        failed: 'failed',
    },
    op: {
        debit: 'debit',
        credit: 'credit'
    },
    txnUidSize: 6,
    txnUidRetryAttempts: 10,
    otpLen: 4,
    otpExpiryInSeconds: 5 * 60,
});
