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

class Network {
    // TODO: Retry & throttling for network apis

    static async getUtxo(address) {
        // throttle calls to api
        await sleep(1000)

        return new Promise((resolve, reject) => {
            BITBOX.Address.utxo(address).then((result) => {
                try {
                    let utxo = result.sort((a, b) => { return a.satoshis - b.satoshis })[result.length - 1]
                    resolve(utxo)
                } catch (ex) { reject(ex) }
            }, (err) => {
                console.log(err)
                reject(err)
            })
        })
    }

    static async getAllUtxo(address) {
        // throttle calls to api
        await sleep(1000)

        return new Promise((resolve, reject) => {
            BITBOX.Address.utxo(address).then((result) => {
                resolve(result)
            }, (err) => {
                console.log(err)
                reject(err)
            })
        })
    }

    static async pollForUtxo(address) {
        try {
          while (true) {
            // rate limit
            await sleep(10 * 1000)

            let utxos = await this.getAllUtxo(address)

            // return highest value utxo when first utxo is found
            if (utxos && utxos.length > 0) {
              let utxo = utxos.sort((a, b) => { return a.satoshis - b.satoshis })[utxos.length - 1]
              console.log("utxo: ", utxo)
              return utxo
            }
            else
              console.log("Waiting for funding...")
          }
        } catch (ex) {
          console.log("Poll for utxo ex: ", ex)
        }
      }

    // Return final balance in sats
    static async mergeUtxos(wallet) {
        // throttle calls to api
        await sleep(1000)

        return new Promise( async (resolve, reject) => {
            try {
                let utxos = await this.getAllUtxo(wallet.address)

                if (!utxos || utxos.length == 0) {
                    resolve(0)
                    return
                }
                if (utxos.length == 1) {
                    resolve(utxos[0].satoshis)
                    return
                }

                let transactionBuilder = new BITBOX.TransactionBuilder(window.scaleCashSettings.networkString)

                let totalUtxoAmount = 0
                utxos.forEach((utxo) => {
                    transactionBuilder.addInput(utxo.txid, utxo.vout)
                    totalUtxoAmount += utxo.satoshis
                })

                let byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: utxos.length }, { P2PKH: 1 })

                // testnet fees
                if (window.scaleCashSettings.isTestnet) byteCount *= 15
                
                let satoshisAfterFee = totalUtxoAmount - byteCount

                transactionBuilder.addOutput(wallet.address, satoshisAfterFee)

                let key = BITBOX.ECPair.fromWIF(wallet.wif)

                let redeemScript
                utxos.forEach((utxo, index) => {
                    transactionBuilder.sign(index, key, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, utxo.satoshis)
                })

                let hex = transactionBuilder.build().toHex()
                await this.sendTxAsync(hex)

                resolve(satoshisAfterFee)
            }
            catch (ex) {
                resolve(0)
            }
        })
    }

    static async recoverUtxosByNode(hdNode, recoverAddress) {
        return new Promise( async (resolve, reject) => {
            try {
                // Search for utxos for 100 addresses at a time, until no utxos found
                let utxosByNode = []
                let index = 0
                let stepIndexBy = 100
                while (true) {
                    let nodes = []
                    let addresses = []
                    for (var i=index; i<index+stepIndexBy; i++) {
                        let node = BITBOX.HDNode.derivePath(hdNode, `1/${i + 1}`)
                        nodes.push(node)

                        let address = BITBOX.HDNode.toLegacyAddress(node)
                        addresses.push(address)
                    }

                    // throttle api calls
                    await sleep(1000)

                    // get all utxos for each address
                    let utxosByAddress = await this.getAllUtxo(addresses)

                    let foundAllUtxos = false
                    for (var i=0; i<utxosByAddress.length; i++) {
                        if (utxosByAddress[i].length > 0) {
                            utxosByNode.push({
                                node: nodes[i],
                                utxos: utxosByAddress[i]
                            })
                        } else {
                            foundAllUtxos = true
                            break
                        }
                    }

                    if (foundAllUtxos) break

                    index += stepIndexBy
                }

                let transactionBuilder = new BITBOX.TransactionBuilder(window.scaleCashSettings.networkString)

                let totalInputSatoshis = 0
                let totalUtxos = 0
                utxosByNode.forEach((utxosNode) => {
                    let utxos = utxosNode.utxos
                    utxos.forEach((utxo) => {
                        transactionBuilder.addInput(utxo.txid, utxo.vout)
                        totalInputSatoshis += utxo.satoshis
                        totalUtxos += 1
                    })
                })

                let byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: totalUtxos }, { P2PKH: 1 })
                let satoshisAfterFee = totalInputSatoshis - byteCount

                transactionBuilder.addOutput(recoverAddress, satoshisAfterFee)

                let redeemScript
                let inputIndex = 0
                utxosByNode.forEach((utxosNode) => {
                    let node = utxosNode.node
                    let utxos = utxosNode.utxos
                    let key = BITBOX.HDNode.toKeyPair(node)
                    utxos.forEach((utxo) => {
                        transactionBuilder.sign(inputIndex, key, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, utxo.satoshis)
                        inputIndex += 1
                    })
                })

                let hex = transactionBuilder.build().toHex()
                await this.sendTxAsync(hex)

                resolve()
            }
            catch (ex) {
                reject("recoverUtxosByNode failure: " + ex)
            }
        })
    }

    static async getMostRecentTxId(address) {
        // throttle calls to api
        await sleep(1000)

        return new Promise((resolve, reject) => {
            BITBOX.Address.details(address).then((result) => {
                try {
                    if (result.transactions && result.transactions.length)
                        resolve(result.transactions[0])
                    else
                        resolve(null)
                } catch (ex) { reject(ex) }
            }, (err) => {
                console.log(err)
                reject(err)
            })
        })
    }

    static async getAddressDetails(address) {
        // throttle calls to api
        await sleep(1000)

        return new Promise((resolve, reject) => {
            BITBOX.Address.details(address).then((result) => {
                resolve(result)
            }, (err) => {
                console.log(err)
                reject(err)
            })
        })
    }

    static async getTxDetails(txid) {
        return new Promise((resolve, reject) => {
            BITBOX.Transaction.details(txid).then((result) => {
                resolve(result)
            }, (err) => {
                reject(err)
            })
        })
    }

    static async pollForTxDetails(txid) {
        for (let i=0; i < 10; i++) {
            try {
                // rate limit
                await sleep(10 * 1000)

                let txDetails = await this.getTxDetails(txid)

                if (txDetails !== undefined) return txDetails
            } catch (ex) { }
        }

        // Not found
        return undefined
    }

    static async pollForConfirmation(txid) {
        while (true) {
          try {
            // rate limit
            await sleep(30 * 1000)

            let txDetails = await this.getTxDetails(txid)

            // return highest value utxo when first utxo is found
            if (txDetails && txDetails.confirmations > 0)
              return txDetails
            else
              console.log("Waiting for split tx confirmation...")
          } catch (ex) {
            console.log("Poll for confirmation ex: ", ex)
          }
        }
      }

    static async sendTxAsync(hex) {
        // throttle calls to api
        await sleep(1000)

        return new Promise((resolve, reject) => {
            BITBOX.RawTransactions.sendRawTransaction(hex).then((result) => {
                try {
                    console.log("txid: ", result)
                    if (result.length != 64) { // TODO: Validate result is a txid
                        reject("Transaction failed: " + result)
                    }
                    else {
                        resolve(result)
                    }
                } catch (ex) { reject(ex) }
            }, (err) => {
                console.log(err)
                reject(err)
            })
        })
    }

    static async sendTxChainAsync(hexList) {
        return new Promise(async (resolve, reject) => {
          let totalSent = 0
          for (let i = 0; i < hexList.length; i++) {
            try {
              await this.sendTxAsync(hexList[i])
                totalSent += 1
                await sleep(1000)
            } catch (ex) {
              console.log("send tx chain failure, chain " + i + " ex:", ex)
              reject(ex)
              break
            }
          }

          resolve(totalSent)
        })
      }

    static async sendBatch(hexListByAddress) {
        let totalSent = 0
        for (let i = 0; i < hexListByAddress.length; i++) {
          try {
            let sent = await this.sendTxChainAsync(hexListByAddress[i])
            totalSent += sent
          } catch (ex) {
            console.log(`Wallet chain_${i} exception:`, ex)
          }
        }
        console.log("Sent " + totalSent + " transactions successfully")
      }

    static async getMempoolInfo() {
        // throttle calls to api
        await sleep(1100)

        return new Promise((resolve, reject) => {
            BITBOX.Blockchain.getMempoolInfo().then((result) => {
                try {
                    if(result && result.size) {
                        resolve(result.size)
                    } else {
                        resolve('No Result. Trying again...')
                    }
                } catch (ex) { reject(ex) }
            }, (err) => {
                console.log(err)
                reject(err)
            })
        })
    }
}

export default Network
