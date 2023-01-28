document.addEventListener("DOMContentLoaded", async (event) => {
  // Make sure rest of code executes after mainnet-js has been imported properly
  Object.assign(globalThis, await __mainnetPromise);

  // Test that indexedDB is available
  var db = window.indexedDB.open('test');
  db.onerror = () => alert("Can't use indexedDB, might be because of private window.")

  // Initialize wallet
  DefaultProvider.servers.testnet = ["wss://chipnet.imaginary.cash:50004"]
  const wallet = await TestNetWallet.named("mywallet");
  console.log(wallet)
  Config.EnforceCashTokenReceiptAddresses = true;

  // Import BCMR
  const url = "https://raw.githubusercontent.com/mr-zwets/example_bcmr/main/example_bcmr.json"
  await BCMR.addMetadataRegistryFromUri(url);
  function getTokenInfo(tokenId){
    const tokenList = BCMR.getRegistries()[0].identities;
    return tokenList[tokenId]? tokenList[tokenId][0] : undefined;
  }

  // Display BCH balance and watch for changes
  let balance = await wallet.getBalance();
  let maxAmountToSend = await wallet.getMaxAmountToSend();
  document.querySelector('#balance').innerText = `${balance.sat} testnet satoshis`;
  wallet.watchBalance(async (newBalance) => {
    balance = newBalance;
    maxAmountToSend = await wallet.getMaxAmountToSend();
    document.querySelector('#balance').innerText = `${balance.sat} testnet satoshis`;
  });
  // Display token categories, construct arrayTokens and watch for changes
  let arrayTokens = [];
  let tokenCategories = [];
  fetchTokens()
  async function fetchTokens() {
    arrayTokens = [];
    const getTokensResponse = await wallet.getAllTokenBalances();
    tokenCategories = Object.keys(getTokensResponse);
    document.querySelector('#tokenBalance').innerText = `${tokenCategories.length} different tokentypes`;
    for (const tokenId of tokenCategories) {
      if(getTokensResponse[tokenId]){
        arrayTokens.push({ tokenId, amount: getTokensResponse[tokenId] });
        continue;
      }
      // Otherwise tokenId has NFTs, so query utxos for tokenData
      const utxos = await wallet.getTokenUtxos(tokenId);
      for (const utxo of utxos) {
        const tokenData = utxo.token;
        arrayTokens.push({ tokenId, tokenData });
      }
    }
    // Either display tokens in wallet or display there are no tokens
    const divNoTokens = document.querySelector('#noTokensFound');
    if (arrayTokens.length) {
      divNoTokens.textContent = "";
      createListWithTemplate(arrayTokens);
    } else {
      divNoTokens.textContent = "Currently there are no tokens in this wallet";
    }
  }

  wallet.watchAddressTokenTransactions(async(tx) => fetchTokens());

  // Initilize address and display QR code
  const tokenAddr = await wallet.getTokenDepositAddress();
  document.querySelector('#depositAddr').innerText = tokenAddr;
  const qr = await wallet.getTokenDepositQr();
  document.querySelector('#depositQr').src = qr.src;

  // Functionality buttons BchWallet view
  window.maxBch = function maxBch(event) {
    event.currentTarget.parentElement.querySelector('#sendAmount').value = maxAmountToSend.sat;
  }
  document.querySelector('#send').addEventListener("click", async () => {
    try {
      const amount = document.querySelector('#sendAmount').value;
      const validInput = Number.isInteger(+amount) && +amount > 0;
      if(!validInput) throw(`Amount satoshis to send must be a valid integer`);
      if(amount < 546) throw(`Must send atleast 546 satoshis`);
      const addr = document.querySelector('#sendAddr').value;
      const { txId } = await wallet.send([{ cashaddr: addr, value: amount, unit: "sat" }]);
      alert(`Sent ${amount} sats to ${addr}`);
      console.log(`Sent ${amount} sats to ${addr} \nhttps://chipnet.imaginary.cash/tx/${txId}`);
    } catch (error) { alert(error) }
  });

  // Functionality buttons CreateTokens view
  document.querySelector('#createTokens').addEventListener("click", async () => {
    // Check if fungibles are selected
    if(document.querySelector('#newtokens').value === "fungibles"){
      // Check inputField
      const tokenSupply = document.querySelector('#tokenSupply').value;
      const validInput = Number.isInteger(+tokenSupply) && +tokenSupply > 0;
      if(!validInput){alert(`Input total supply must be a valid integer`); return}
      async function createFungibleTokens(){
        try {
          const genesisResponse = await wallet.tokenGenesis({
            cashaddr: tokenAddr,
            amount: tokenSupply,            // fungible token amount
            value: 1000,                    // Satoshi value
          });
          const tokenId = genesisResponse.tokenIds[0];
          const { txId } = genesisResponse;

          alert(`Created ${tokenSupply} fungible tokens of category ${tokenId}`);
          console.log(`Created ${tokenSupply} fungible tokens \nhttps://chipnet.imaginary.cash/tx/${txId}`);
          return txId
        } catch (error) { console.log(error) }
      }
      await createFungibleTokens();
    }
    else{ // If minting NFT is selected
    async function createMintingToken(){
      try{
      const genesisResponse = await wallet.tokenGenesis({
        cashaddr: tokenAddr,
        commitment: "",             // NFT Commitment message
        capability: NFTCapability.minting, // NFT capability
        value: 1000,                    // Satoshi value
      });
      const tokenId = genesisResponse.tokenIds[0];
      const { txId } = genesisResponse;

      alert(`Created minting token for category ${tokenId}`);
      console.log(`Created minting token for category ${tokenId} \nhttps://chipnet.imaginary.cash/tx/${txId}`);
      return txId
      }catch (error) { alert(error) }
    }
    await createMintingToken();
    }
  });

  document.querySelector('#view2').addEventListener("click", async () => {
    async function getValidPreGensis() {
      let walletUtxos = await wallet.getAddressUtxos();
      return walletUtxos.filter(utxo => !utxo.token && utxo.vout === 0);
    }
    let validPreGenesis= await getValidPreGensis()
    console.log(validPreGenesis)
    if(validPreGenesis.length === 0){
      document.querySelector("#plannedTokenId").textContent = 'loading...';
      document.querySelector("#plannedTokenId").value = "";
      await wallet.send([{ cashaddr: wallet.tokenaddr, value: 10000, unit: "sat" }]);
      console.log("Created output with vout zero for token genesis");
      validPreGenesis= await getValidPreGensis()
    }
    const tokenId = validPreGenesis[0].txid;
    const displayId = `${tokenId.slice(0, 20)}...${tokenId.slice(-10)}`;
    document.querySelector("#plannedTokenId").textContent = displayId;
    document.querySelector("#plannedTokenId").value = tokenId;
  });

  // Create tokenlist
  function createListWithTemplate(tokens) {
    const Placeholder = document.getElementById("Placeholder");
    const ul = document.createElement("ul");
    ul.setAttribute("id", "Placeholder");
    const template = document.getElementById("token-template");

    tokens.forEach(async (token, index) => {
      const tokenCard = document.importNode(template.content, true);
      const tokenInfo = getTokenInfo(token.tokenId);
      let decimals = 0;
      let symbol = "";
      if(tokenInfo){
        symbol = tokenInfo.token.symbol;
        decimals = tokenInfo.token.decimals;
      }
      // Display tokenID for fungibles & NFTs
      const displayId = `${token.tokenId.slice(0, 20)}...${token.tokenId.slice(-10)}`;
      tokenCard.querySelector("#tokenID").textContent = displayId;
      tokenCard.querySelector("#tokenID").value = token.tokenId;
      if(tokenInfo) tokenCard.querySelector("#tokenName").textContent = `Name: ${tokenInfo.name}`;
      // Stuff specific for fungibles
      if(token.amount){
        tokenCard.querySelector("#tokenType").textContent = "Fungible Tokens";
        const textTokenAmount = `${token.amount/(10**decimals)} ${symbol}`;
        tokenCard.querySelector("#tokenAmount").textContent = `Token amount: ${textTokenAmount}`;
        const tokenSend = tokenCard.querySelector('#tokenSend');
        tokenSend.style = "display:block;"
        const sendSomeButton = tokenSend.querySelector("#sendSomeButton");
        sendSomeButton.onclick = () => {
          let tokenAmount = Number(tokenSend.querySelector('#sendTokenAmount').value);
          const inputAddress = tokenSend.querySelector('#tokenAddress').value;
          sendTokens(inputAddress, tokenAmount, token.tokenId, tokenInfo);
        }
        window.maxTokens = function maxTokens(event) {
          let tokenAmount = token.amount;
          if(tokenInfo) tokenAmount = token.amount / (10 ** tokenInfo.token.decimals);
          event.currentTarget.parentElement.querySelector('#sendTokenAmount').value = tokenAmount;
        }
      } else{
        // Stuff specific for NFTs
        const tokenCapability = token.tokenData.capability;
        const nftTypes = {
          minting: "Minting NFT",
          mutable: "Mutable NFT",
          none: "Immutable NFT"
        };
        tokenCard.querySelector("#tokenType").textContent = nftTypes[tokenCapability];
        const tokenCommitment = token.tokenData.commitment;
        if (tokenCommitment != "") {
          const commitmentText = `NFT commitment: ${tokenCommitment}`;
          tokenCard.querySelector("#tokenCommitment").textContent = commitmentText;
        }
        const nftSend = tokenCard.querySelector('#nftSend');
        nftSend.style = "display:block;";
        const sendNftButton = nftSend.querySelector("#sendNFT");
        sendNftButton.onclick = () => {
          const inputAddress = nftSend.querySelector('#tokenAddress').value;
          sendNft(inputAddress, token.tokenId, tokenCapability)
        }
        const nftMint = tokenCard.querySelector('#nftMint');
        if (tokenCapability == "minting") nftMint.style = "display:block;"
        const mintNftButton = nftMint.querySelector("#mintNFT");
        mintNftButton.onclick = () => {
          const commitmentInput = nftMint.querySelector('#commitmentInput').value;
          mintNft(token.tokenId, commitmentInput)
        }
      }
      ul.appendChild(tokenCard);
    });
    Placeholder.replaceWith(ul);
  }

  // Functionality buttons MyTokens view
  async function sendTokens(address, amountEntered, tokenId, tokenInfo) {
    try {
      const decimals = tokenInfo? tokenInfo.token.decimals : 0;
      const amountTokens = decimals ? amountEntered * (10 ** decimals) : amountEntered;
      const validInput = Number.isInteger(amountTokens) && amountTokens > 0;
      if(!validInput && !decimals) throw(`Amount tokens to send must be a valid integer`);
      if(!validInput && decimals) throw(`Amount tokens to send must only have ${decimals} decimal places`);
      const { txId } = await wallet.send([
        new TokenSendRequest({
          cashaddr: address,
          amount: amountTokens,
          tokenId: tokenId,
        }),
      ]);
      const displayId = `${tokenId.slice(0, 20)}...${tokenId.slice(-10)}`;
      let message = `Sent ${amountEntered} fungible tokens of category ${displayId} to ${address}`;
      if(tokenInfo) message = `Sent ${amountEntered} ${tokenInfo.token.symbol} to ${address}`;
      alert(message);
      console.log(`${message} \nhttps://chipnet.imaginary.cash/tx/${txId}`);
    } catch (error) { alert(error) }
  }

  async function sendNft(address, tokenId, tokenCapability) {
    try {
      const { txId } = await wallet.send([
        new TokenSendRequest({
          cashaddr: address,
          tokenId: tokenId,
          commitment: "",
          capability: tokenCapability,
        }),
      ]);
      const displayId = `${tokenId.slice(0, 20)}...${tokenId.slice(-10)}`;
      alert(`Sent NFT of category ${displayId} to ${address}`);
      console.log(`Sent NFT of category ${displayId} to ${address} \nhttps://chipnet.imaginary.cash/tx/${txId}`);
    } catch (error) { alert(error) }
  }

  async function mintNft(tokenId, tokenCommitment) {
    try {
      const isHex = (str) => /^[A-F0-9]+$/i.test(str);
      if(!isHex(tokenCommitment)) throw(`tokenCommitment ${tokenCommitment} must be a hexadecimal`);
      const { txId } = await wallet.tokenMint(
        tokenId,
        [
          new TokenMintRequest({
            cashaddr: tokenAddr,
            commitment: tokenCommitment,
            capability: NFTCapability.none,
            value: 1000,
          })
        ],
      );
      const displayId = `${tokenId.slice(0, 20)}...${tokenId.slice(-10)}`;
      const commitmentText= tokenCommitment? `with commitment ${tokenCommitment}`: "";
      alert(`Minted immutable NFT of category ${displayId} ${commitmentText}`);
      console.log(`Minted immutable NFT of category ${displayId} ${commitmentText} \nhttps://chipnet.imaginary.cash/tx/${txId}`);
    } catch (error) { alert(error) }
  }

})

// Logic for copy onclick
window.copyTextContent = function copyTextContent(id) {
  var element = document.getElementById(id);
  navigator.clipboard.writeText(element.textContent);
}
window.copyTokenID = function copyTokenID(event, id='tokenID') {
  navigator.clipboard.writeText(event.currentTarget.parentElement.querySelector(`#${id}`).value)
}

// Change view logic
window.changeView = function changeView(newView) {
  const displayView0 = newView == 0 ? "block" : "none";
  const displayView1 = newView == 1 ? "block" : "none";
  const displayView2 = newView == 2 ? "block" : "none";
  document.querySelector('#walletView').style = `display: ${displayView0};`;
  document.querySelector('#tokenView').style = `display: ${displayView1};`;
  document.querySelector('#createTokensView').style = `display: ${displayView2};`;
  [0, 1, 2].forEach( index => {
    document.querySelector(`#view${index}`).classList = "view";
  })
  document.querySelector(`#view${newView}`).classList = "view active";
}

// Change create token view
window.selectTokenType = function selectTokenType(){
  document.querySelector('#tokenSupply').parentElement.classList.toggle("hide");
}
