import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles'
import Paper from '@material-ui/core/Paper'
import Typography from '@material-ui/core/Typography'
import Button from '@material-ui/core/Button'
import TextField from '@material-ui/core/TextField'
import QRCode from 'qrcode.react'
import IconButton from '@material-ui/core/IconButton'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import CardActions from '@material-ui/core/CardActions'
import Collapse from '@material-ui/core/Collapse'
import CardContent from '@material-ui/core/CardContent'
import Grid from '@material-ui/core/Grid'


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
  }
})

class Wallet extends Component {
  constructor(props) {
    super(props)

    this.state = {
      mnemonic: "",
      isImportingMnemonic: false,
      isWalletExpanded: true,
      canRecoverFunds: false,
    }
  }

  handleChangeMnemonic = (event) => {
    this.setState({ mnemonic: event.target.value })
  }

  handleChange = name => event => {
    event.preventDefault()

    this.setState({
      [name]: event.target.value,
    })
  }

  handleCreateWallet = (event) => {
    event.preventDefault()

    this.props.createWallet()
  }

  handleSubmitMnemonic = (event) => {
    event.preventDefault()

    this.props.createWallet(this.state.mnemonic)
  }

  handleExpandWallet = () => {
    this.setState(state => ({ isWalletExpanded: !state.isWalletExpanded }));
  }

  renderWallet = () => {
    const { classes } = this.props

    return (<div>
      <Paper className={classes.root} elevation={3}>
        <Typography variant="headline" component="h3">
          Wallet
        </Typography>
        <br/>
        <div className={classes.grid}>
          <Grid container spacing={24}>
            <Grid item xs={12}>
              <QRCode value={this.props.wallet.wallet.cashAddress} /> <br/>
              <Typography component="p">
                <b>Address:</b> { this.props.wallet.wallet.cashAddress } <br/>
                <b>Balance:</b> { this.props.wallet.wallet.balance } <br/>
                <br/>
                { this.props.wallet.canRecoverFunds ? "Lost funds found. Please attempt to recover before starting a stresstest" : "" }
              </Typography>
              <CardActions className={classes.cardActions}>
              {/* <Button
                variant="contained"
                color="primary"
                className={classes.button}
                onClick={this.props.recoverOrphanUtxos}
                disabled={ !this.props.wallet.canRecoverFunds }
              >
                Recover Lost Funds
              </Button> */}
              <Button
                variant="contained"
                color="primary"
                className={classes.button}
                onClick={this.props.refreshBalance}
                disabled={ this.props.wallet.isPollingForDeposit || this.props.wallet.isStresstesting ? true : false }
              >
                Refresh Balance
              </Button>
              <IconButton
                className={this.state.isWalletExpanded ? `${classes.expand} ${classes.expandOpen}` : classes.expand }
                onClick={this.handleExpandWallet}
                aria-expanded={this.state.isWalletExpanded}
                aria-label="Show more"
              >
                <ExpandMoreIcon />
              </IconButton>
            </CardActions>
            <Collapse in={this.state.isWalletExpanded} timeout="auto" unmountOnExit>
              <CardContent>
                  <div style={{overflow: "scroll"}}>
                    <b>Save the following now:</b> <br/>
                    <b>WIF:</b> { this.props.wallet.wallet.wif } <br/>
                    <b>Mnemonic:</b> { this.props.wallet.mnemonic } <br/>
                    <b>Message:</b> { this.props.wallet.messageToSign } <br/>
                    <b>Message Signature Proof: </b> { this.props.wallet.signature }
                  </div>
                </CardContent>
              </Collapse>
            </Grid>
          </Grid>
        </div>
      </Paper>
    </div>);
  }

  renderCreateImportWallet = () => {
    const { classes } = this.props

    let setupChoices = (<div>
        <Button variant="contained" color="primary" className={classes.button} onClick={this.handleCreateWallet}>
          Create new wallet
        </Button>
        <Button variant="contained" color="secondary" className={classes.button} onClick={() => this.setState({isImportingMnemonic: true})}>
          Import existing wallet
        </Button>
      </div>);

    let importMenmonicForm = (<div>
        <form noValidate autoComplete="off">
          <TextField
            label="Mnemonic"
            className={classes.textField}
            value={this.state.mnemonic}
            onChange={this.handleChangeMnemonic}
            margin="normal"
          />
          <Button variant="contained" color="primary" className={classes.button} onClick={this.handleSubmitMnemonic}>
            Import
          </Button>
          <Button variant="contained" color="secondary" className={classes.button} onClick={() => this.setState({isImportingMnemonic: false})}>
            Cancel
          </Button>
        </form>
      </div>);

    return (<div>
      <Paper className={classes.root} elevation={3}>
        <Typography variant="headline" component="h3">
          Setup your wallet
        </Typography>
        <Typography component="p">
          If you have a mnemonic for a previous wallet, import it below. <br/>
          Otherwise create a new wallet and deposit funds to begin.
        </Typography>
        { this.state.isImportingMnemonic ? importMenmonicForm : setupChoices }
      </Paper>
    </div>);
  }

  renderCurrentPhase = () => {
    if (!this.props.wallet) return this.renderCreateImportWallet()
    else return this.renderWallet()
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

export default withStyles(classStyles)(Wallet);
