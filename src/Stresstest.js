import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles'
import Paper from '@material-ui/core/Paper'
import Typography from '@material-ui/core/Typography'
import Button from '@material-ui/core/Button'
import CardActions from '@material-ui/core/CardActions'
import Grid from '@material-ui/core/Grid'
import LinearProgress from '@material-ui/core/LinearProgress'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import Checkbox from '@material-ui/core/Checkbox'
import Credits from './Credits'

const classStyles = theme => ({
  root: {
    ...theme.mixins.gutters(),
    paddingTop: theme.spacing.unit * 2,
    paddingBottom: theme.spacing.unit * 2,
    backgroundColor: '#fff',
    boxShadow: 'none'
  },
  progress: {
    flexGrow: 1,
  },
  button: {
    margin: theme.spacing.unit,
    marginLeft: 0,
    background: '#F59332',
    '&:hover': {
      background: '#4D4D4D'
    }
  },
  cardActions: {
    paddingLeft: 0,
  },
  textField: {
    marginLeft: 0,//theme.spacing.unit,
    marginRight: theme.spacing.unit,
    width: 200,
  },
  expand: {
    transform: 'rotate(0deg)',
    transition: theme.transitions.create('transform', {
      duration: theme.transitions.duration.shortest,
    }),
    marginLeft: 'auto',
  },
  expandOpen: {
    transform: 'rotate(180deg)',
  },
  grid: {
    flexGrow: 1,
  },
  log: {
    height: 400,
    overflow: "scroll",
  },
  credits: {
    textDecoration: 'none',
    color: '#F59332',
    transition: '0.4s',
    '&:hover': {
      color: '#4D4D4D',
      transition: '0.4s'
    }
  },
  checkbox: {
    color: '#F59332',
    '&$checked': {
      color: '#F59332'
    },
  },
  checked: {},
})

class Stresstest extends Component {
  constructor(props) {
    super(props)

    this.state = {
      isStresstesting: false,
      isStresstestExpanded: false,
      isDonating: true,
    }
  }

  handleChange = name => event => {
    event.preventDefault()

    this.setState({
      [name]: event.target.value,
    })
  }

  handleCheckboxChange = name => event => {
    this.setState({ [name]: event.target.checked });
  }

  startStresstest = () => {
    let isDonating = this.state.isDonating
    this.setState({
      isStresstesting: true,
    }, () => this.props.startStresstest(isDonating))
  }

  startNewStresstest = () => {
    this.props.wallet.prepData.numTxToSend = 0

    this.setState({
      isStresstesting: false,
    }, this.props.wallet.pollForDeposit)
  }

  handleExpandStresstestClick = () => {
    this.setState(state => ({ isStresstestExpanded: !state.isStresstestExpanded }));
  }

  getStresstestCompletePercent = () => {
    let numSent = this.props.wallet.txSentThisRun
    let numTxToSend = this.props.wallet.prepData.numTxToSend

    if (numTxToSend < 1) return 0
    else return (numSent / numTxToSend) * 100
  }

  renderFooterStats = () => {
    return (<div>
      <b>Mempool Size: </b> { this.props.wallet.mempoolSize } transactions <br/>
      <b>Your Total TX Sent: </b> { this.props.wallet.totalTxSent } transactions <br/>
      <b>TX in past 24 hours: </b> { this.props.wallet.transactions24h } transactions (provided by <a className={this.props.classes.credits} href="https://blockchair.com">blockchair.com</a>)
    </div>);
  }

  renderStresstest = () => {
    const { classes } = this.props

    let log = this.props.wallet.log.slice(0).map((logLine, index) => {
      let txidIndex = logLine.indexOf("txid: ")
      if (txidIndex != -1) {
        let prefix = logLine.slice(0, txidIndex)
        let txid = logLine.slice(txidIndex + 6)
        return <div key={index}>{prefix}<a className={this.props.classes.credits} href={"https://explorer.bitcoin.com/bch/tx/" + txid}>{txid}</a></div>
      } else {
        return <div key={index}>{logLine}</div>
      }
    })

    let runningMessage = `Sending ${ this.props.wallet.prepData.numTxToSend } transactions. Keep your browser open.`
    let finishedMessage = `Finished sending ${ this.props.wallet.txSentThisRun } transactions`

    return (<div>
      <Paper className={classes.root} elevation={3}>
        <Typography variant="headline" component="h3">
          { this.props.wallet.isStresstesting ? runningMessage : finishedMessage }
        </Typography>
        <div className={classes.log}>
          {log}
        </div>
        <div>
          <b>Sent: </b> { this.props.wallet.txSentThisRun }
        </div>
        <div className={classes.progress}>
          <LinearProgress classes={{
              colorPrimary: '#F59332',
              barColorPrimary: '#4D4D4D', 
            }}
            variant="determinate"
            value={this.getStresstestCompletePercent()}
          />
        </div>
        <CardActions className={classes.cardActions}>
          <Button
            variant="contained"
            color="primary"
            className={classes.button}
            onClick={ this.startNewStresstest }
            disabled={ this.getStresstestCompletePercent() !== 100 ? true : false }
          >
            Start New Stresstest
          </Button>
        </CardActions>
        { this.renderFooterStats() }
      </Paper>
      <Credits classes={classes}></Credits>
    </div>);
  }

  renderReady = () => {
      const { classes } = this.props

    let numTxToSend = this.props.wallet ? this.props.wallet.prepData.numTxToSend : 0
    let headerMessage = numTxToSend > 0 ? "Ready to send " + numTxToSend + " transactions" : "Deposit 15,000 to 1,300,000 satoshis (~$0.08 to $7) to start"

    return (<div>
      <Paper className={classes.root} elevation={3}>
        <Typography variant="headline" component="h3">
          {headerMessage}
        </Typography>
        <br/>
        <div className={classes.grid}>
          <Grid container spacing={24}>
            <Grid item xs={9}>
              <Typography component="p">
                Deposit funds then press start to begin stresstesting. <br/>
                Remember to first <b>save</b> your <b>WIF, mnemonic, and proof of tx signature</b> from your wallet above in case you need to recover funds
              </Typography>
            </Grid>
          </Grid>
        </div>
        <CardActions className={classes.cardActions}>
          <Button
            variant="contained"
            color="primary"
            className={classes.button}
            onClick={this.startStresstest}
            disabled={ numTxToSend == 0 || (this.props.wallet && this.props.wallet.isPollingForDeposit) ? true : false }
          >
            Start Stresstest
          </Button>
          <FormControlLabel
            control={
              <Checkbox
              checked={this.state.isDonating}
              onChange={this.handleCheckboxChange('isDonating')}
              value="isDonating"
              classes={{ root: classes.checkbox, checked: classes.checked  }}
              /> 
            } label="Donate change and collected dust to eatBCH?"
          />
        </CardActions>
        <div>
          <b>
            All transactions are signed and sent by your browser. Import your mnemonic into a wallet to recover if you refresh during testing.
          </b>
        </div> <br/>
        { this.props.wallet ? this.renderFooterStats() : "" }
      </Paper>
      <Credits classes={classes}></Credits>
    </div>);
  }

  renderCurrentPhase = () => {
    if (this.state.isStresstesting) return this.renderStresstest()
    else return this.renderReady()
  }

  render() {
    return (
      <div>
        <div>
          { this.renderCurrentPhase() }
        </div>
      </div>
    );
  }
}

export default withStyles(classStyles)(Stresstest);
