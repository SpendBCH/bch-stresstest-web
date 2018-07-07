import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles'
import Paper from '@material-ui/core/Paper'
import Typography from '@material-ui/core/Typography'
import Button from '@material-ui/core/Button'
import CardActions from '@material-ui/core/CardActions'
import Grid from '@material-ui/core/Grid'
import LinearProgress from '@material-ui/core/LinearProgress'
import Credits from './Credits'

const classStyles = theme => ({
  root: {
    ...theme.mixins.gutters(),
    paddingTop: theme.spacing.unit * 2,
    paddingBottom: theme.spacing.unit * 2,
    //maxWidth: 600,
  },
  progress: {
    flexGrow: 1,
  },
  button: {
    margin: theme.spacing.unit,
    marginLeft: 0,
    background: '#F59332' 
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
  }
})

class Stresstest extends Component {
  constructor(props) {
    super(props)

    this.state = {
      isStresstesting: false,
      stresstestExpanded: false,
    }
  }

  handleChange = name => event => {
    event.preventDefault()

    this.setState({
      [name]: event.target.value,
    })
  }

  startStresstest = () => {
    this.setState({
      isStresstesting: true,
    }, this.props.startStresstest)
  }

  startNewStresstest = () => {
    this.setState({
      isStresstesting: false,
    }, this.props.wallet.pollForDeposit)
  }

  handleExpandStresstestClick = () => {
    this.setState(state => ({ stresstestExpanded: !state.stresstestExpanded }));
  }

  getStresstestCompletePercent = () => {
    let numSent = this.props.wallet.txSentThisRun
    let numToSend = this.props.wallet.getNumTxToSend()

    if (numToSend < 1) return 0
    else return (numSent / numToSend) * 100
  }

  renderStresstest = () => {
    const { classes } = this.props

    let log = this.props.wallet.log.slice(0).map(l => {
      return <div key={l}>{l}</div>
    })

    return (<div>
      <Paper className={classes.root} elevation={3}>
        <Typography variant="headline" component="h3">
          Sending { this.props.wallet.getNumTxToSend() } transactions
        </Typography>
        <div className={classes.log}>
          {log}
        </div>
        <div>
          <b>Total Sent: </b> { this.props.wallet.totalTxSent }
        </div>
        <div className={classes.progress}>
          <LinearProgress variant="determinate" value={this.getStresstestCompletePercent()} />
        </div>
        <CardActions className={classes.cardActions}>
          <Button
            variant="contained"
            color="primary"
            className={classes.button}
            onClick={ this.startNewStresstest }
            disabled={ this.getStresstestCompletePercent() != 100 ? true : false }
          >
            Start New Stresstest
          </Button>
        </CardActions>
        <div>
          <b>Mempool Size: </b> { this.props.wallet.mempoolSize } transactions
        </div>
        <Credits></Credits>
      </Paper>
    </div>);
  }

  renderReady = () => {
    const { classes } = this.props

    let numTxToSend = this.props.wallet ? this.props.wallet.getNumTxToSend() : 0
    let headerMessage = numTxToSend > 0 ? "Ready to send " + numTxToSend + " transactions" : "Deposit at least 15k sats to start"
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
                Remember to first <b>save</b> your <b>WIF, mnemonic, and proof of tx signature</b> from your wallet above
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
            disabled={ numTxToSend == 0 ? true : false }
          >
            Start Stresstest
          </Button>
        </CardActions>
        <Credits></Credits>
      </Paper>
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
