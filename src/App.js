import React, { Component } from 'react';
import './App.css';
import Header from './Header'
import Wallet from './Wallet'
import Stresstest from './Stresstest'
import StresstestWallet from './stresstest-lib/wallet'

const styles = {
  header: {
    color: "white",
  }
}

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      wallet: null,
     }
  }

  componentDidMount() {
    // Import wallet if stored locally
    let mnemonic
    if (window.scaleCashSettings.isTestnet) {
      mnemonic = JSON.parse(localStorage.getItem('testnetMnemonic'))
    } else {
      mnemonic = JSON.parse(localStorage.getItem('mnemonic'))
    }
    if (mnemonic != null) {
      this.createWallet(mnemonic)
    }
  }

  startStresstest = () => {
    this.state.wallet.startStresstest()
  }

  recoverOrphanUtxos = () => {
    let recoverAddress = this.state.wallet.node0LegacyAddress
    this.state.wallet.recoverOrphanUtxos(recoverAddress)
  }

  createWallet = (mnemonic) => {
    let wallet = new StresstestWallet(mnemonic)

    // Serialize wallet and store in localstorage
    if (window.scaleCashSettings.isTestnet) {
      localStorage.setItem('testnetMnemonic', JSON.stringify(wallet.mnemonic))
    } else {
      localStorage.setItem('mnemonic', JSON.stringify(wallet.mnemonic))
    }

    wallet.listen((res) => {
      this.setState({ wallet: res.wallet })
    })

    this.setState({ wallet: wallet })
  }

  render() {
    return (
      <div className="App">
        <Header /> <br/>
        <hr/>
        <div>
          <Wallet wallet={this.state.wallet} createWallet={this.createWallet} recoverOrphanUtxos={this.recoverOrphanUtxos} />
          <hr/>
          <Stresstest wallet={this.state.wallet} startStresstest={this.startStresstest} />
        </div>
        <div>
        </div>
      </div>
    );
  }
}

export default App;
