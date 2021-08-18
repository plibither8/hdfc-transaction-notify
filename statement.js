const pptr = require("puppeteer");

/** Utils */
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const innerText = (element) => element.evaluate((el) => el.innerText.trim());
const amountToDecimal = (str) => Number(str.trim().replace(/,/g, ""));

/** Constants */
const HDFC_NETBANKING_URL = "https://netbanking.hdfcbank.com/netbanking/";

const selectors = {
  login: {
    FRAME: "frame",
    CUSTOMER_ID_INPUT: 'input[name="fldLoginUserId"]',
    PASSWORD_INPUT: 'input[name="fldPassword"]',
    CONTINUE_BUTTON: "a.login-btn",
    LOGIN_BUTTON: "a.login-btn",
    SECURE_ACCESS_CHECKBOX: 'input[name="chkrsastu"]',
  },
  logout: {
    FRAME: 'frame[name="common_menu1"]',
    LOGOUT_BUTTON: 'img[alt="Log Out"]',
  },
  statement: {
    LEFT_MENU_FRAME: 'frame[name="left_menu"]',
    ACCT_SUMMARY_BTN: "li.menu-summary.active a",
    MAIN_PART_FRAME: 'frame[name="main_part"]',
    VIEW_STATEMENT_BUTTON: "a.viewbtngrey",
    WAIT_FOR_CHECK: 'form[name="frmTxn"]',
    SAVINGS_ACCT_TABLE_HEADER: "td.PSMSubHeader",
  },
};

async function login(config, page, retriesLeft = 3) {
  if (!retriesLeft) return false;
  console.log("Logging in...", `[${4 - retriesLeft} / 3]`);
  try {
    await page.goto(HDFC_NETBANKING_URL, { waitUntil: "networkidle2" });
    const frameElement = await page.waitForSelector(selectors.login.FRAME);
    const frame = await frameElement.contentFrame();
    await frame.type(selectors.login.CUSTOMER_ID_INPUT, config.customerId);
    await frame.click(selectors.login.CONTINUE_BUTTON);
    await frame.waitForSelector(selectors.login.PASSWORD_INPUT);
    await frame.type(selectors.login.PASSWORD_INPUT, config.password);
    if (config.secureAccess)
      await frame.click(selectors.login.SECURE_ACCESS_CHECKBOX);
    await frame.click(selectors.login.LOGIN_BUTTON);
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    return true;
  } catch (err) {
    await wait(1000);
    return await login(config, page, --retriesLeft);
  }
}

async function logout(page) {
  console.log("Logging out...");
  try {
    const frameElement = await page.waitForSelector(selectors.logout.FRAME);
    const frame = await frameElement.contentFrame();
    await frame.click(selectors.logout.LOGOUT_BUTTON);
    await page.waitForNavigation({ waitUntil: "networkidle2" });
  } catch (err) {
    await wait(1000);
    logout(page);
  }
}

async function openStatement(config, page, retriesLeft, index) {
  if (!retriesLeft) return false;
  console.log("Opening statement...", `[${4 - retriesLeft} / 3]`);
  try {
    const mainPartFrameElement = await page.waitForSelector(
      selectors.statement.MAIN_PART_FRAME
    );
    const mainPartFrame = await mainPartFrameElement.contentFrame();
    await mainPartFrame.click(selectors.statement.SAVINGS_ACCT_TABLE_HEADER);
    const viewStatementBtn = (
      await mainPartFrame.$$(selectors.statement.VIEW_STATEMENT_BUTTON)
    )[index];
    await viewStatementBtn.click();
    const form = await mainPartFrame.waitForSelector(
      selectors.statement.WAIT_FOR_CHECK
    );
    return form;
  } catch (err) {
    await wait(1000);
    return openStatement(config, page, --retriesLeft, index);
  }
}

async function getBalance(balanceTable) {
  const balanceElement = await balanceTable.$("b");
  const balanceText = await innerText(balanceElement);
  const balance = Number(amountToDecimal(balanceText.slice(4)));
  return balance;
}

async function getTransactions(transactionsTable) {
  const transactions = [];
  const rows = (await transactionsTable.$$("tr")).slice(1);
  for (const row of rows) {
    const cells = await Promise.all((await row.$$("td")).map(innerText));
    transactions.push({
      id: cells[2],
      description: cells[1],
      date: new Date(cells[0]),
      valueDate: new Date(cells[3]),
      withdrawal: amountToDecimal(cells[4]),
      deposit: amountToDecimal(cells[5]),
      closingBalance: amountToDecimal(cells[6]),
    });
  }
  return transactions;
}

async function parseStatement(form) {
  console.log("Parsing statement...");
  const tables = await form.$$("table");
  const balance = await getBalance(tables[1]);
  const transactions = await getTransactions(tables[2]);
  return { balance, transactions };
}

async function launchBrowserAndLogin(config) {
  console.log("Launching browser...");
  const browser = await pptr.launch({
    headless: config.headless,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 720 });
  if (!(await login(config, page))) return false;
  return [browser, page];
}

async function logoutAndCloseBrowser(browser, page) {
  await logout(page);
  console.log("Closing browser...");
  await page.close();
  await browser.close();
}

async function goBackToAccountSummary(page, retriesLeft = 3) {
  if (!retriesLeft) return false;
  console.log("Going back to accounts page...", `[${4 - retriesLeft} / 3]`);
  try {
    const leftMenuFrameElement = await page.waitForSelector(
      selectors.statement.LEFT_MENU_FRAME
    );
    const leftMenuFrame = await leftMenuFrameElement.contentFrame();
    const accountSummaryBtn = await leftMenuFrame.$(
      selectors.statement.ACCT_SUMMARY_BTN
    );
    await accountSummaryBtn.click();
  } catch (err) {
    return goBackToAccountSummary(page, --retriesLeft);
  }
}

async function getLatestStatement(config, page, index) {
  const statementForm = await openStatement(config, page, 3, index);
  if (!statementForm) return false;
  const statement = await parseStatement(statementForm);
  await goBackToAccountSummary(page);
  return statement;
}

module.exports = {
  launchBrowserAndLogin,
  getLatestStatement,
  logoutAndCloseBrowser,
};
