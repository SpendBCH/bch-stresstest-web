import stUtils from './utils'
import network from './network'

let BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default;
let BITBOX
if (window.scaleCashSettings.isTestnet) {
  BITBOX = new BITBOXCli({
    restURL: 'https://trest.bitbox.earth/v1/'
  })
} else {
  BITBOX = new BITBOXCli();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const maxAddresses = 200

class StresstestWallet {
    constructor(mnemonic) {
        // If WIF does not exist, create new node and address
        if (mnemonic === undefined) {
            mnemonic = BITBOX.Mnemonic.generate(256)
        }
        this.mnemonic = mnemonic

        let rootSeed = BITBOX.Mnemonic.toSeed(mnemonic)
        let masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, window.scaleCashSettings.networkString)
        this.hdNode = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")
        this.node0 = BITBOX.HDNode.derivePath(this.hdNode, "0/0")
        this.node0WIF = BITBOX.ECPair.toWIF(BITBOX.HDNode.toKeyPair(this.node0))

        let ecpair = BITBOX.ECPair.fromWIF(this.node0WIF)
        this.node0LegacyAddress = BITBOX.ECPair.toLegacyAddress(ecpair)
        this.node0CashAddress = BITBOX.ECPair.toCashAddress(ecpair)
        this.pubKey = Buffer(BITBOX.ECPair.toPublicKey(ecpair), 'hex')
        this.wallet = {
            address: this.node0LegacyAddress,
            cashAddress: this.node0CashAddress,
            pubKey: this.pubKey,
            wif: this.node0WIF,
            balance: 0
        }

        this.messageToSign = "stresstestbitcoin.cash";
        this.signature = BITBOX.BitcoinCash.signMessageWithPrivKey(this.node0WIF, this.messageToSign);

        this.listeners = []

        this.log = []

        this.totalTxSent = 0
        this.mempoolSize = 0
        this.txSentThisRun = 0

        // Look for funds to recover
        this.canRecoverFunds = false
        this.searchForOrphanUtxos(this.hdNode)
        this.pollForDeposit()
        this.pollForMempoolinfo()
    }

    listen = (listener) => {
        this.listeners.push(listener)
    }

    publish = () => {
        this.listeners.forEach(listener => listener({
            wallet: this
        }))
    }

    appendLog = (logLine) => {
        // Do not write same message to log
        if (logLine == this.log[this.log.length-1]) return

        this.log.push(logLine)
        this.publish()
    }

    pollForDeposit = async () => {
        if (this.isPollingForDeposit)
            return

        this.isPollingForDeposit = true
        this.utxo = undefined
        while (true) {
            if (!this.isPollingForDeposit) return

            try {
                let utxos = await network.getAllUtxo(this.wallet.address)
                this.utxo = undefined
                if (utxos.length > 1) {
                    await network.mergeUtxos(this.wallet)
                    await sleep(3000)
                    this.utxo = await network.getUtxo(this.wallet.address)
                } else if (utxos.length == 0) {
                    this.wallet.balance = 0
                } else if (utxos.length == 1) {
                    this.utxo = utxos[0]
                }

                if (this.utxo !== undefined) {
                    this.wallet.balance = this.utxo.satoshis
                    this.publish()
                }
            } catch (ex) {}

            await sleep(10 * 1000)
        }
    }

    pollForMempoolinfo = async () => {
        while (true) {
          try {
            this.mempoolSize = await network.getMempoolInfo()
            this.publish()
          } catch (ex) { 
            // Backoff a few seconds after failure
            await sleep(3300)
          }
        }
    }

    searchForOrphanUtxos = async (hdNode) => {
        let node1 = BITBOX.HDNode.derivePath(hdNode, `1/${1}`)
        let nodeAddress1 = BITBOX.HDNode.toLegacyAddress(node1)
        let node2 = BITBOX.HDNode.derivePath(hdNode, `1/${2}`)
        let nodeAddress2 = BITBOX.HDNode.toLegacyAddress(node2)

        let utxos = await network.getAllUtxo([nodeAddress1, nodeAddress2])

        if (utxos !== undefined && utxos.length > 0 && utxos[0].length > 0)
            this.canRecoverFunds = true
        else
            this.canRecoverFunds = false

        this.publish()
      }

    recoverOrphanUtxos = async (recoverAddress) => {
        try {
            // Merge utxos to recover address
            await network.recoverUtxosByNode(this.hdNode, recoverAddress)

            this.canRecoverFunds = false
            this.publish()

            // Get newly created utxo
            await sleep(1000)
            this.pollForDeposit()
        } catch (ex) {}
    }

    getNumTxToSend = () => {
        if (this.utxo === undefined) return 0

        let wallet = {
            satoshis: this.utxo.satoshis,
            txid: this.utxo.txid,
            vout: this.utxo.vout
        }

        let dustLimitSats = 546
        let maxTxChain = 24
        let feePerTx = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: 3 })
        let satsPerAddress = feePerTx * maxTxChain + dustLimitSats
        let splitFeePerAddress = BITBOX.BitcoinCash.getByteCount({ P2PKH: 0 }, { P2PKH: 1 })
        let numAddresses = Math.floor((wallet.satoshis) / (satsPerAddress + splitFeePerAddress))

        // Check for max tx size limit
        if (numAddresses > maxAddresses)
        numAddresses = maxAddresses

        // Reduce number of addresses as required for split tx fee
        let byteCount = 0
        let satsChange = 0
        while (satsChange < dustLimitSats) {
            // Calculate splitTx fee and change to return to refundAddress
            byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: numAddresses + 3 })
            satsChange = wallet.satoshis - byteCount - (numAddresses * satsPerAddress)

            if (satsChange < dustLimitSats) {
                numAddresses = numAddresses - 1
            }
        }

        if (numAddresses == 0) return 0

        let numTxToSend = (numAddresses * maxTxChain) - numAddresses
        return numTxToSend + 1
    }

    startStresstest = async () => {
        // Wait for utxo to arrive to build starting wallet
        this.isPollingForDeposit = false
        let utxo
        while (true) {
            if (this.utxo === undefined) sleep(500)
            else {
                utxo = this.utxo
                break
            }
        }

        // reset log
        this.log = []
        this.txSentThisRun = 0

        // TODO: Get refund address from tx details
        let refundAddress = utxo.legacyAddress

        this.appendLog("Change will be sent to your address:" + refundAddress)

        let wallet = {
            satoshis: utxo.satoshis,
            txid: utxo.txid,
            vout: utxo.vout
        }

        let dustLimitSats = 546
        let maxTxChain = 24 // 24 or lower, last is final merge tx
        let feePerTx = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: 3 })
        let satsPerAddress = feePerTx * maxTxChain + dustLimitSats
        let splitFeePerAddress = BITBOX.BitcoinCash.getByteCount({ P2PKH: 0 }, { P2PKH: 1 })
        let numAddresses = Math.floor((wallet.satoshis) / (satsPerAddress + splitFeePerAddress))

        // Check for max tx size limit
        if (numAddresses > maxAddresses)
        numAddresses = maxAddresses

        // Reduce number of addresses as required for split tx fee
        let byteCount = 0
        let satsChange = 0
        while (satsChange < dustLimitSats) {
            // Calculate splitTx and final merge tx fees and change to return to refundAddress
            byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: numAddresses + 3 })
            satsChange = wallet.satoshis - byteCount - (numAddresses * satsPerAddress)

            if (satsChange < dustLimitSats) {
                numAddresses = numAddresses - 1
            }
        }

        this.appendLog(`Creating ${numAddresses} addresses to send ${numAddresses * (maxTxChain-1)+1} transactions with ${satsChange} sats change to be refunded`)

        let splitAddressResult = stUtils.splitAddress(wallet, numAddresses, satsPerAddress, this.hdNode, this.node0, refundAddress, satsChange, maxTxChain)
        let splitTxHex = splitAddressResult.hex
        let walletChains = splitAddressResult.wallets

        // Broadcast split tx
        let splitTxid
        while (true) {
          try {
            splitTxid = await network.sendTxAsync(splitTxHex)
            break
          } catch (ex) {}
          await sleep(3300)
        }
        this.appendLog("Split tx completed. Txid: " + splitTxid)

        // Generate transactions for each address
        let hexListByAddress = stUtils.createChainedTransactions(walletChains, refundAddress)

        // Wait for first confirmation before stress testing to avoid mempool chain limit
        this.appendLog("Waiting for first confirmation of split tx...")
        await network.pollForConfirmation(splitTxid)

        this.appendLog(`Split tx confirmed. Starting broadcast...`)

        // flatten array
        let allTxToSend = [].concat(...hexListByAddress)
        this.numTxToSend = allTxToSend.length

        // send each tx
        for (let i=0; i< allTxToSend.length; i++) {
            // Must send all tx in order, backoff request rate until sent
            let requestDelaySeconds = 2
            while (true) {
                try {
                    let txid = await network.sendTxAsync(allTxToSend[i])
                    this.appendLog("Sent txid: " + txid)
                    break
                } catch (ex) {
                    let message = "Problem sending tx. Trying again in " + requestDelaySeconds + " seconds"
                    if (i == allTxToSend.length - 1) {
                        message = "Waiting for next block to merge final dust. Please wait."
                        requestDelaySeconds = 10
                    }

                    this.appendLog(message)
                    console.log("tx send failed: " + ex)
                }

                await sleep(requestDelaySeconds * 1000)
                requestDelaySeconds += 1
            }

            this.totalTxSent += 1
            this.txSentThisRun += 1
            this.publish()

            await sleep(1000)
        }
    }
}

export default StresstestWallet
