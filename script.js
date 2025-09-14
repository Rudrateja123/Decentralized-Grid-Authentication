import { ethers } from "ethers";
import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
// Vite will automatically handle the Buffer polyfill with your vite.config.js

// ⚠️ PASTE YOUR ENCRYPTION-ENABLED CONTRACT ADDRESS AND ABI HERE
const CONTRACT_ADDRESS = "0x6D999cd61eb005aEc0d4405B47EA40E68BBa8dce";
const CONTRACT_ABI = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"}],"name":"PasswordUpdated","type":"event"},{"inputs":[{"internalType":"string","name":"_encryptedPositions","type":"string"}],"name":"register","outputs":[],"stateMutability":"nonpayable","type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"}],"name":"Registered","type":"event"},{"inputs":[{"internalType":"string","name":"_encryptedPositions","type":"string"}],"name":"updatePassword","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"getMyPositions","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}];

const colors = ["#1a6366","#f5388a","#9638f5","#389af5","#38f5d2","#a0f538","#f5b038","#f53838","#e238f5"];
let passwordPositions = [];
let enteredPin = [];
let provider = null;
let signer = null;
let contract = null;

// ====== SIGNATURE-BASED ENCRYPTION KEY ======
async function getEncryptionKey() {
    if (!signer) {
        throw new Error("Wallet not connected");
    }
    const message = "Welcome to Decentralized Grid Authentication. Sign this message to generate your secure session key. This is not a transaction and will not cost any gas.";
    alert("Please sign the message in MetaMask to create your secure key.");
    const signature = await signer.signMessage(message);
    return signature;
}

// ====== ETHERS V5 HELPERS ======
async function connectAndInitialize() {
    if (typeof window.ethereum === 'undefined') {
        alert("Please install MetaMask!");
        throw new Error("MetaMask not installed");
    }
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

async function connectWallet() {
  try {
    await connectAndInitialize();
    const address = await signer.getAddress();
    alert(`Wallet connected: ${address}`);
  } catch (err) {
    console.error("Failed to connect wallet:", err);
    alert("Could not connect. Check the console for errors.");
  }
}

// ====== PAGE BOOTSTRAP & EVENT LISTENERS ======
document.addEventListener("DOMContentLoaded", () => {
  const connectWalletBtn = document.getElementById('connectWalletBtn');
  if (connectWalletBtn) connectWalletBtn.addEventListener('click', connectWallet);

  const gridElement = document.getElementById("grid");
  if (gridElement) {
    const isSetup = document.title.includes("Set");
    const isUpdate = document.title.includes("Update");
    const isUnlock = document.title.includes("Unlock");
    
    const grid = generateGrid(isUnlock);
    drawGrid(gridElement, grid, isSetup || isUpdate);
    
    if (isUnlock) localStorage.setItem("currentGrid", JSON.stringify(grid));
    
    const saveBtn = document.getElementById("savePassword");
    if (saveBtn) saveBtn.addEventListener("click", onSavePasswordClicked);
    
    const updateBtn = document.getElementById("updatePasswordBtn");
    if (updateBtn) updateBtn.addEventListener("click", onUpdatePasswordClicked);
  }

  document.querySelectorAll('.keypad-digit').forEach(button => {
    button.addEventListener('click', () => enterDigit(parseInt(button.dataset.digit)));
  });
  const clearLastBtn = document.getElementById('clearLastBtn');
  if (clearLastBtn) clearLastBtn.addEventListener('click', clearLast);
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) clearAllBtn.addEventListener('click', clearAll);
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', submitPin);
});

// ====== GRID LOGIC ======
function generateGrid(fillNumbers = false) {
  const grid = [];
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9), col = i % 9;
    grid.push({ color: colors[(row % 3) * 3 + (col % 3)], value: fillNumbers ? Math.floor(Math.random() * 10) : "" });
  }
  return grid;
}
function drawGrid(container, gridData, clickable) {
  container.innerHTML = "";
  passwordPositions = [];
  const subgrids = Array.from({ length: 9 }, () => {
    const subgrid = document.createElement('div');
    subgrid.className = 'subgrid';
    container.appendChild(subgrid);
    return subgrid;
  });
  gridData.forEach((cell, index) => {
    const subgridIndex = Math.floor(Math.floor(index / 9) / 3) * 3 + Math.floor((index % 9) / 3);
    const box = document.createElement("div");
    box.className = 'grid-cell';
    box.style.backgroundColor = cell.color;
    box.dataset.content = cell.value;
    box.innerHTML = '&nbsp;';
    box.dataset.index = index;
    if (clickable) {
      box.onclick = () => {
        const pos = passwordPositions.indexOf(index);
        if (pos !== -1) passwordPositions.splice(pos, 1);
        else if (passwordPositions.length < 4) passwordPositions.push(index);
        updateGridVisuals();
      };
    }
    subgrids[subgridIndex].appendChild(box);
  });
}
function updateGridVisuals() {
  document.querySelectorAll(".grid-cell").forEach(box => {
    const index = parseInt(box.dataset.index);
    const positionInArray = passwordPositions.indexOf(index);
    if (positionInArray > -1) {
      box.classList.add("selected");
      box.dataset.content = positionInArray + 1;
    } else {
      box.classList.remove("selected");
      box.dataset.content = "";
    }
  });
}

// ====== SETUP: SAVE POSITIONS ======
async function onSavePasswordClicked() {
  if (passwordPositions.length !== 4) return alert("Select exactly 4 positions.");
  try {
    if (!signer || !contract) await connectAndInitialize();
    
    const secretKey = await getEncryptionKey();
    const positionsString = JSON.stringify(passwordPositions);
    
    const encryptedString = AES.encrypt(positionsString, secretKey).toString();

    const tx = await contract.register(encryptedString);
    alert("Encrypting and saving password... Please confirm in MetaMask.");
    await tx.wait();
    alert("Password encrypted and saved on-chain! ✅");
    window.location.href = "unlock.html";
  } catch (e) {
    console.error("Registration failed:", e);
    alert("Error saving password. Check the console.");
  }
}

// ====== NEW: UPDATE PASSWORD ======
async function onUpdatePasswordClicked() {
  if (passwordPositions.length !== 4) return alert("Select exactly 4 new positions.");
  try {
    if (!signer || !contract) await connectAndInitialize();
    
    const secretKey = await getEncryptionKey();
    const positionsString = JSON.stringify(passwordPositions);

    const encryptedString = AES.encrypt(positionsString, secretKey).toString();

    const tx = await contract.updatePassword(encryptedString);
    alert("Updating password... Please confirm in MetaMask.");
    await tx.wait();
    alert("Password updated successfully! ✅");
    window.location.href = "dashboard.html";
  } catch (e) {
    console.error("Update failed:", e);
    alert("Error updating password. Check the console.");
  }
}

// ====== UNLOCK: LOGIN LOGIC ======
function enterDigit(digit) {
  if (enteredPin.length < 4) enteredPin.push(digit);
  updateEnteredPin();
}
function clearLast() {
  enteredPin.pop();
  updateEnteredPin();
}
function clearAll() {
  enteredPin = [];
  updateEnteredPin();
}
function updateEnteredPin() {
  const el = document.getElementById("enteredPin");
  if (el) el.textContent = enteredPin.join("");
}

// In script.js, replace the old submitPin function with this one

// In script.js, replace the old submitPin function with this one

async function submitPin() {
  if (enteredPin.length !== 4) return alert("Enter a 4-digit PIN.");
  const currentGrid = JSON.parse(localStorage.getItem("currentGrid"));
  if (!currentGrid) return alert("No grid found. Please navigate to Unlock page properly.");
  
  try {
    if (!signer || !contract) await connectAndInitialize();
    
    const secretKey = await getEncryptionKey();
    const encryptedString = await contract.getMyPositions();
    const decryptedBytes = AES.decrypt(encryptedString, secretKey);
    const decryptedPositionsString = decryptedBytes.toString(Utf8);
    
    if (!decryptedPositionsString) {
        throw new Error("Decryption failed. The signature key may be incorrect.");
    }
    
    const decryptedPositions = JSON.parse(decryptedPositionsString);
    const correctPin = decryptedPositions.map(idx => currentGrid[idx].value);

    if (correctPin.join('') === enteredPin.join('')) {
      window.location.href = 'dashboard.html';
    } else {
      const gridElement = document.getElementById("grid");
      
      // 1. Start the shake animation
      gridElement.classList.add('shake');
      
      // 2. After the shake, show the alert and start the fade-out
      setTimeout(() => {
        alert("Incorrect PIN. ❌ The grid will now reset.");
        gridElement.classList.add('fade-out'); // Make old numbers fade away
        
        // 3. After the fade-out, reset the grid and fade back in
        setTimeout(() => {
            const newGrid = generateGrid(true);
            drawGrid(gridElement, newGrid, false);
            localStorage.setItem("currentGrid", JSON.stringify(newGrid));
            clearAll();
            gridElement.classList.remove('fade-out'); // Make new numbers fade in
        }, 300); // This delay matches the fade animation

        // 4. Clean up the shake class
        gridElement.classList.remove('shake');
      }, 500); // This delay matches the shake animation
    }
  } catch (err) {
    console.error(err);
    alert("Error verifying PIN. You may have rejected the signature request or the data is corrupt. Check the console.");
  }
}