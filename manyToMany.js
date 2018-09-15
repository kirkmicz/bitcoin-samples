const _ = require('lodash');
const axios = require('axios');
const sb = require('satoshi-bitcoin');
const bitcoin = require('bitcoinjs-lib');

let tx = new bitcoin.TransactionBuilder();
const fee = 10000;
const changeAddress = '<change address>';
const safestConfirmation = 6;
const network = bitcoin.networks.bitcoin;
const origins = _.map(
  ['<secret here>',
    '<secret here>'], privateKey => {
  const keyPair = bitcoin.ECPair.fromWIF(privateKey);
  const { address } = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: network });
  return {
    secret: keyPair.toWIF(),
    address: address
  };
});
const destinations = [{
  address: '<destination address>',
  amount: 0.00001,
}, {
  address: '<destination address>',
  amount: 0.5,
}];

const unspents = () => {
  return Promise.all(_.map(origins, origin => {
    return axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${origin.address}?unspentOnly=true&token=b9b7822b926f4c78960d4bba193190f9`)
      .then( data => {
        const r = _.map(data.data.txrefs, o => _.extend({
          address: origin.address,
          secret: origin.secret
        }, o));
        return r;
      });
  }))
}

unspents()
  .then( data => {
    const signers = []
    const unspents = _.flatMapDepth(data)
    let totalAmount = sb.toSatoshi(_.sumBy(destinations, (o) => { return o.amount; }));
    const totalAmountPlusFee = fee + totalAmount;
    const totalInputs = _.sum(_.map(unspents, (utxo, index) => {
      if (utxo.confirmations > safestConfirmation) {
        signers.push(utxo.secret);
        tx.addInput(utxo.tx_hash, utxo.tx_output_n);
        return utxo.value;
      }
    }));
    if (totalInputs > totalAmountPlusFee) {
      _.map(destinations, dest => {
        tx.addOutput(dest.address, sb.toSatoshi(dest.amount));
      });
      const change = totalInputs - totalAmountPlusFee;
      if (change > 0) {
        tx.addOutput(changeAddress, change);
      }
      _.forEach(tx.__inputs, (x, index) => {
        tx.sign(index, bitcoin.ECPair.fromWIF(signers[index]));
      });
      console.info(tx.build().toHex());
    } else {
      console.error('Insufficient balance.')
    }
  })
  .catch( error => {
    console.error(`Error: ${error}`)
  })