let BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default;
let BITBOX
if (window.scaleCashSettings.isTestnet) {
  BITBOX = new BITBOXCli({
    restURL: 'https://trest.bitbox.earth/v1/'
  })
} else {
  BITBOX = new BITBOXCli();
}

const opReturnTagText = "stresstestbitcoin.cash";
const opReturnTagBuffer = BITBOX.Script.nullData.output.encode(Buffer.from(opReturnTagText, 'ascii'));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

class Utils {

	static async getUtxo(address) {
		// throttle calls to api
		await sleep(1000)

		return new Promise((resolve, reject) => {
			BITBOX.Address.utxo(address).then((result) => {
				let utxo = result.sort((a, b) => { return a.satoshis - b.satoshis })[result.length - 1]
				resolve(utxo)
			}, (err) => {
				console.log(err)
				reject(err)
			})
		})
	}

	static txidFromHex(hex) {
    let buffer = Buffer.from(hex, "hex")
    let hash = BITBOX.Crypto.hash256(buffer).toString('hex')
    return hash.match(/[a-fA-F0-9]{2}/g).reverse().join('')
  }

	static splitAddress(wallet, numAddresses, satsPerAddress, hdNode, node0, changeAddress, satsChange, maxTxChain) {
    let transactionBuilder = new BITBOX.TransactionBuilder(window.scaleCashSettings.networkString);
    transactionBuilder.addInput(wallet.txid, wallet.vout);

    // Check change against dust limit
    let numChangeOutputs = 0
    if (satsChange >= 546) {
      transactionBuilder.addOutput(changeAddress, satsChange)
      numChangeOutputs = 1
    }

    let firstNode = BITBOX.HDNode.derivePath(hdNode, `1/1`)
    let firstNodeLegacyAddress = BITBOX.HDNode.toLegacyAddress(firstNode)
    let firstNodeKeyPair = BITBOX.HDNode.toKeyPair(firstNode)

    let walletChains = []
    for (let i = 0; i < numAddresses; i++) {

      // let firstNode = BITBOX.HDNode.derivePath(hdNode, `1/${i + 1}`)
      // let firstNodeLegacyAddress = BITBOX.HDNode.toLegacyAddress(firstNode)
      // let firstNodeKeyPair = BITBOX.HDNode.toKeyPair(firstNode)

      let walletChain = {
				wallet: {
					vout: i + numChangeOutputs,
					address: firstNodeLegacyAddress,
					satoshis: satsPerAddress,
					keyPair: firstNodeKeyPair,
				},
				chainLength: maxTxChain-1,
      }

      transactionBuilder.addOutput(firstNodeLegacyAddress, satsPerAddress)

      walletChains.push(walletChain)
    }

    // write stresstestbitcoin.cash to the chain w/ OP_RETURN
    transactionBuilder.addOutput(opReturnTagBuffer, 0);

    let keyPair = BITBOX.HDNode.toKeyPair(node0);

    let redeemScript
    transactionBuilder.sign(0, keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, wallet.satoshis)

    let hex = transactionBuilder.build().toHex()

    // txid of this split/fanout tx
    let splitTxid = this.txidFromHex(hex)

    let walletsWithTxid = walletChains.map((wc) => {
      wc.wallet.txid = splitTxid
      return wc
    })

    let changeWallet = {
      txid: splitTxid,
      satoshis: satsChange,
      vout: 0,
    }

    return {
      hex: hex,
      wallets: walletsWithTxid,
      changeWallet: changeWallet,
    }
  }

  static createChainedTransactions(walletChains, refundAddress) {
    let hexByAddress = []

    for (let i = 0; i < walletChains.length; i++) {
      let walletChain = walletChains[i]

      let hexList = []
      let wallet = walletChain.wallet
      for (let j = 0; j < walletChain.chainLength; j++) {
        let txResult = this.createTx(wallet, wallet.address)

        // Update wallet for next send
        wallet.txid = txResult.txid
        wallet.satoshis = txResult.satoshis
        wallet.vout = txResult.vout

        hexList.push(txResult.hex)
      }
      hexByAddress.push(hexList.slice())
    }
    
    // Phase 1 create 1 pre-merge tx per 10 inputs
    let mergeAddress = walletChains[0].wallet.address
    let startIdx = 0
    let incrementBy = 10 // max inputs per tx
    let endIdx = 0
    let mergeHexList = []
    let finalMergeWallets = []

    // Too many inputs, divide into multiple merge tx
    if (walletChains.length > incrementBy + 5) {
      while (endIdx < walletChains.length) {
        endIdx += incrementBy

        // Pull last few inputs into this tx (must have at least 5 inputs)
        if (walletChains.length - endIdx <= 5) {
          endIdx += incrementBy
        }

        let mergeWallets = walletChains.slice(startIdx, endIdx)
        let preMergeRes = this.createFinalMergeTx(mergeWallets, mergeAddress)
        finalMergeWallets.push({ 
          wallet: {
            txid: preMergeRes.txid,
            satoshis: preMergeRes.satoshis,
            vout: preMergeRes.vout,
            keyPair: walletChains[0].wallet.keyPair,
          }
        })
        mergeHexList.push(preMergeRes.hex)

        // step startIdx
        startIdx += incrementBy
      }

      hexByAddress.push(mergeHexList)
    }
    // Otherwise only one merge tx
    else {
      finalMergeWallets = walletChains
    }

    // Phase 2 merge the merge txs
    let finalMergeTx = this.createFinalMergeTx(finalMergeWallets, refundAddress)
    hexByAddress.push([finalMergeTx.hex])

    return hexByAddress
  }

  static createTx(wallet, targetAddress) {
    let transactionBuilder = new BITBOX.TransactionBuilder(window.scaleCashSettings.networkString)
    transactionBuilder.addInput(wallet.txid, wallet.vout)

    // Calculate fee @ 1 sat/byte
    let byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: 3 })

    // testnet fees
    if (window.scaleCashSettings.isTestnet) byteCount *= 15

    let satoshisAfterFee = wallet.satoshis - byteCount

		transactionBuilder.addOutput(targetAddress, satoshisAfterFee)

    // write stresstestbitcoin.cash to the chain w/ OP_RETURN
    transactionBuilder.addOutput(opReturnTagBuffer, 0);

    let redeemScript
    transactionBuilder.sign(0, wallet.keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, wallet.satoshis)

    let hex = transactionBuilder.build().toHex()

    let txid = this.txidFromHex(hex)

    return { txid: txid, satoshis: satoshisAfterFee, vout: 0, hex: hex }
	}

	static createFinalMergeTx(walletChains, targetAddress) {
		let transactionBuilder = new BITBOX.TransactionBuilder(window.scaleCashSettings.networkString)
		
		let totalInputSatoshis = 0
		walletChains.forEach((walletChain) => {
			let wallet = walletChain.wallet
			transactionBuilder.addInput(wallet.txid, wallet.vout)
			totalInputSatoshis += wallet.satoshis
		})

    // Calculate fee @ 1 sat/byte
    let byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: walletChains.length }, { P2PKH: 3 })

    // testnet fees
    if (window.scaleCashSettings.isTestnet) byteCount *= 15
    
    let satoshisAfterFee = totalInputSatoshis - byteCount

		transactionBuilder.addOutput(targetAddress, satoshisAfterFee)

    // write stresstestbitcoin.cash to the chain w/ OP_RETURN
    transactionBuilder.addOutput(opReturnTagBuffer, 0);

		let redeemScript
		walletChains.forEach((walletChain, index) => {
			let wallet = walletChain.wallet
			transactionBuilder.sign(index, wallet.keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, wallet.satoshis)
		})

    let hex = transactionBuilder.build().toHex()

    let txid = this.txidFromHex(hex)

    return {
      hex: hex,
      txid: txid,
      satoshis: satoshisAfterFee,
      vout: 0,
    }
  }

}

export default Utils
