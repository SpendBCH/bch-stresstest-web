import React, { Component } from 'react'

class Credits extends Component {
  render() {
    return (
      <div>
        Created by <a className={this.props.classes.credits} href='https://twitter.com/SpendBCH_io'>@SpendBCH_io</a> and <a className={this.props.classes.credits} href='https://twitter.com/cgcardona'>@cgcardona</a>. Made with <a className={this.props.classes.credits} href='https://www.bitbox.earth/'>BITBOX</a>
      </div>
    );
  }
}

export default Credits
