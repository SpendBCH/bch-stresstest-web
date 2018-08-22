import stUtils from './utils'
import network from './network'

let BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default;
let BITBOX
if (window.scaleCashSettings.isTestnet) {
  BITBOX = new BITBOXCli({
    restURL: 'https://trest.bitcoin.com/v1/'
  })
} else {
  BITBOX = new BITBOXCli();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

class StresstestWallet {
    constructor(mnemonic) {
        // If WIF does not exist, create new node and address
        if (mnemonic === undefined) {
            this.mnemonic = BITBOX.Mnemonic.generate(256)
        } else {
            this.mnemonic = mnemonic.trim()
        }

        let rootSeed = BITBOX.Mnemonic.toSeed(this.mnemonic)
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

        // Stresstest preparation data
        this.prepData = {
          numTxToSend: 0,
          numAddresses: 0,
          wallet: null,
          satsPerAddress: 0,
          satsChange: 0,
          maxTxChain: 0,
        }

        // Look for funds to recover
        this.canRecoverFunds = false
        // this.searchForOrphanUtxos(this.hdNode)
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
        if (logLine === this.log[this.log.length-1]) return

        this.log.push(logLine)
        this.publish()
    }

    pollForDeposit = async () => {
        if (this.isPollingForDeposit)
            return

        this.isPollingForDeposit = true
        this.prepData.numTxToSend = 0
        this.publish()

        if (!this.isPollingForDeposit) return

        try {
            let utxos = await network.getAllUtxo(this.wallet.address)
            //this.utxo = undefined
            let utxo
            if (utxos.length > 1) {
                await network.mergeUtxos(this.wallet)
                await sleep(3000)
                utxo = await network.getUtxo(this.wallet.address)
            } else if (utxos.length === 0) {
                this.wallet.balance = 0
            } else if (utxos.length === 1) {
                utxo = utxos[0]
            }

            if (utxo !== undefined) {
                this.utxo = utxo
                this.wallet.balance = this.utxo.satoshis
            }

            // Calculate num tx to send and stresstest data
            this.prepareStresstest()
        } catch (ex) {
            console.log("Problem refreshing balance: " + ex)
        }

        this.isPollingForDeposit = false
        this.publish()
    }

    pollForMempoolinfo = async () => {
        while (true) {
          try {
            this.mempoolSize = await network.getMempoolInfo()
            this.publish()
          } catch (ex) {
            // Backoff a few additional seconds after failure
            await sleep(30 * 1000)
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

    prepareStresstest = () => {
        // must have utxo
        if (this.utxo === undefined) { 
          this.prepData.numTxToSend = 0
          return
        }

        let wallet = {
            satoshis: this.utxo.satoshis,
            txid: this.utxo.txid,
            vout: this.utxo.vout,
            address: this.utxo.legacyAddress,
        }

        let maxAddresses = window.scaleCashSettings.maxAddressesTotal
        let dustLimitSats = 546
        let maxTxChain = 24
        let feePerTx = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: 3 })

        // testnet fee
        if (window.scaleCashSettings.isTestnet) feePerTx *= 15

        let satsPerAddress = feePerTx * maxTxChain + dustLimitSats
        let splitFeePerAddress = BITBOX.BitcoinCash.getByteCount({ P2PKH: 0 }, { P2PKH: 1 })

        // testnet fee
        if (window.scaleCashSettings.isTestnet) splitFeePerAddress *= 15

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

            // testnet fee
            if (window.scaleCashSettings.isTestnet) byteCount *= 15

            satsChange = wallet.satoshis - byteCount - (numAddresses * satsPerAddress)

            if (satsChange < dustLimitSats) {
                numAddresses = numAddresses - 1
            }
        }

        // calculate num merge txs
        let numMergeTx = 0
        if (numAddresses > 25) {
            numMergeTx = Math.floor(numAddresses / 20)
            if (numAddresses % 20 > 5) {
                numMergeTx += 1
            }
        }

        // always include last merge tx (either independent or including pre-merge txs)
        numMergeTx += 1

        // Calculate num transactions that will be sent
        let numTxToSend = 1 + (numAddresses * maxTxChain) - numAddresses + numMergeTx

        // Must send at least 2 
        if (numAddresses <= 1) numTxToSend = 0

        // Update prep settings for upcoming run
        this.prepData = {
          numTxToSend: numTxToSend,
          numAddresses: numAddresses,
          dustLimitSats: dustLimitSats,
          wallet: wallet,
          satsPerAddress: satsPerAddress,
          satsChange: satsChange,
          maxTxChain: maxTxChain,
          numMergeTx: numMergeTx
        }
        this.publish()

        return
    }

    startStresstest = async (isDonating) => {
        // Wait for utxo to arrive to build starting wallet
        this.isPollingForDeposit = false
        this.isStresstesting = true

        // reset log
        this.log = []
        this.txSentThisRun = 0

        let refundAddress
        if (isDonating) {
          refundAddress = "bitcoincash:pp8skudq3x5hzw8ew7vzsw8tn4k8wxsqsv0lt0mf3g"
          let totalDonationSats = (this.prepData.numAddresses * this.prepData.dustLimitSats)

          this.appendLog(`Your change and final dust will be collected to donate to EatBCH via the Bitcoin Cash peer-to-peer electronic cash-to-food system!`)
        } else {  
          refundAddress = this.prepData.wallet.address
          this.appendLog("Change will be sent to your address:" + refundAddress)
        }

        // create fanout tx
        let splitAddressResult = stUtils.splitAddress(this.prepData.wallet, this.prepData.numAddresses, this.prepData.satsPerAddress, this.hdNode, this.node0, refundAddress, this.prepData.satsChange, this.prepData.maxTxChain)
        let splitTxHex = splitAddressResult.hex
        let walletChains = splitAddressResult.wallets

        // Broadcast split tx, wait for successful broadcast
        this.appendLog("Creating fanout transaction")
        let splitTxid
        while (true) {
          try {
            splitTxid = await network.sendTxAsync(splitTxHex)
            break
          } catch (ex) {
            // Special case for tx already in block chain error
            try {
                if (ex !== undefined && ex.length) {
                    if (ex.indexOf("transaction already in block chain") != -1) {
                        break
                    }
                }
            } catch (ex2) {}
          }
          await sleep(10 * 1000)
        }
        this.txSentThisRun += 1
        this.totalTxSent += 1
        this.appendLog("Fanout transaction complete. txid: " + splitTxid)

        // Wait for first confirmation before stress testing to avoid mempool chain limit
        this.appendLog("Waiting for first confirmation of fanout tx...")
        await network.pollForConfirmation(splitTxid)

        this.appendLog(`Fanout tx confirmed. Starting broadcast...`)

        // Set max tx to send in parallel
        let maxParallelTx = walletChains.length < 20 ? walletChains.length : 20;

        // Tx to send generator
        let allTxToSend = stUtils.createChainedTransactions(walletChains, refundAddress, maxParallelTx)

        // send each tx
        let i = 0
        let nextTx = allTxToSend.next()
        while (!nextTx.done) {
            let nextTxHex = Array.isArray(nextTx.value) ? nextTx.value.slice() : nextTx.value

            // Must send all tx in order, backoff request rate until sent
            let requestDelaySeconds = 2
            while (true) {
                try {
                    // Merge transactions will not be an array
                    if (!Array.isArray(nextTxHex)) {
                        let txid = await network.sendTxAsync(nextTxHex)
                        this.appendLog("Sent txid: " + txid)
                        break
                    } else {
                        let parallelResult = await network.sendTxArrayAsync(nextTxHex)
                        nextTxHex = nextTxHex.filter((txItem, txIdx) => {
                            let sendResult = parallelResult[txIdx]
                            if (sendResult.length == 64) {
                                this.appendLog("Sent txid: " + sendResult)
                            }
                            return (sendResult.length != 64 && sendResult.indexOf("transaction already in block chain") == -1)
                        })

                        if (nextTxHex.length > 0) {
                            throw "One or more tx failed. Trying failed txs again."
                        } else {
                            break
                        }
                    }
                } catch (ex) {
                    // Special case for tx already in block chain error
                    try {
                        if (ex !== undefined && ex.length) {
                            if (ex.indexOf("transaction already in block chain") != -1) {
                                break
                            }
                        }
                    } catch (ex2) {}

                    let message = "Problem sending tx. Trying again..."
                    if (i >= this.prepData.numTxToSend - this.prepData.numMergeTx - 1) {
                        if (isDonating) {
                          message = "Waiting for all sent tx to confirm to donate final dust to eatBCH. Please keep your browser open until sent."
                        } else {
                          message = "Waiting for all sent tx to confirm to merge final dust. Please keep your browser open until sent."
                        }
                        requestDelaySeconds = 10
                    }

                    this.appendLog(message)
                    console.log("tx send failed: " + ex)
                }

                await sleep(requestDelaySeconds * 1000)
                requestDelaySeconds += 1
            }

            if (!Array.isArray(nextTx.value)) {
                i += 1
                this.totalTxSent += 1
                this.txSentThisRun += 1
            } else {
                i += nextTx.value.length
                this.totalTxSent += nextTx.value.length
                this.txSentThisRun += nextTx.value.length
            }

            nextTx = allTxToSend.next()
            
            this.publish()

            // process at 50 tx/s
            await sleep(1200)
        }

        this.isStresstesting = false
        this.publish()
    }
}

export default StresstestWallet
