import React, { Component } from 'react'
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';

const classStyles = theme => ({
  root: {
    flexGrow: 1,
  },
  logo: {
    width: '100px',
    paddingLeft: '24px'
  }
});

class Header extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    const { classes } = this.props

    return (
      <div className={classes.root}>
        <AppBar position="static" color="default">
          <img className={classes.logo} src='3-bitcoin-cash-logo-ot-small.png' />
          <Toolbar>
            <Typography variant="title" color="inherit">
              scale.cash
            </Typography>
          </Toolbar>
        </AppBar>
      </div>
    );
  }
}

Header.propTypes = {
  classes: PropTypes.object.isRequired,
}

export default withStyles(classStyles)(Header);
