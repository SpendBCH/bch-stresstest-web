import React, { Component } from 'react'

class Credits extends Component {
  render() {
    return (
      <div> <br />
        Guide and recovery information available on the <a target="_blank" rel="noopener noreferrer" className={this.props.classes.credits} href="https://developer.bitcoin.com/insights/scale.cash.html">Bitcoin.com Developer Insights page</a>
        <br /> <br />
        Created by <a target="_blank" rel="noopener noreferrer" className={this.props.classes.credits} href='https://twitter.com/SpendBCH_io'>@SpendBCH_io</a> and <a target="_blank" rel="noopener noreferrer" className={this.props.classes.credits} href='https://twitter.com/cgcardona'>@cgcardona</a>. Powered by <a target="_blank" rel="noopener noreferrer" className={this.props.classes.credits} href='https://developer.bitcoin.com/bitbox.html'>BITBOX</a>
      </div>
    );
  }
}

export default Credits
