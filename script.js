const balanceAmount = document.querySelector("#balance-amount");
const clearBalanceButton = document.querySelector("#clear-balance-button");
const clearAllButton = document.querySelector("#clear-all-button");
const transferForm = document.querySelector("#transfer-form");
const amountInput = document.querySelector("#amount-input");
const clearAmountButton = document.querySelector("#clear-amount-button");
const transactionType = document.querySelector("#transaction-type");
const expenseCategoryField = document.querySelector("#expense-category-field");
const expenseCategory = document.querySelector("#expense-category");
const transferNote = document.querySelector("#transfer-note-text");
const submitLabel = document.querySelector("#submit-label");
const formMessage = document.querySelector("#form-message");
const incomeAmount = document.querySelector("#today-income");
const expenseAmount = document.querySelector("#today-expense");
const historyBody = document.querySelector("#history-body");
const historyDate = document.querySelector("#history-date");
const chart = document.querySelector("#wallet-chart");
const chartDescription = document.querySelector("#chart-description");
const chartEmpty = document.querySelector("#chart-empty");
const currencyFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "long",
});
const storageKey = "finora-wallet-state-v1";
const defaultOpeningBalanceInSatang = 25548;

let transactions = [];
let openingBalanceInSatang = defaultOpeningBalanceInSatang;
let storageReady = true;

historyDate.textContent = dateFormatter.format(new Date());
loadTransactions();
renderWallet();
renderChart("day");

document.querySelectorAll(".tab-button").forEach((tab) => {
  tab.addEventListener("click", () => {
    const type = tab.dataset.type;
    transactionType.value = type;

    document.querySelectorAll(".tab-button").forEach((button) => {
      const selected = button === tab;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    });

    const isDeposit = type === "deposit";
    expenseCategoryField.hidden = isDeposit;
    expenseCategory.disabled = isDeposit;
    expenseCategory.required = !isDeposit;
    if (isDeposit) expenseCategory.value = "";
    submitLabel.textContent = isDeposit ? "ฝากเงิน" : "ถอนเงิน";
    transferNote.textContent = isDeposit
      ? "ตัวอย่างนี้จำลองการฝากเงินและบันทึกข้อมูลไว้ในอุปกรณ์นี้"
      : "เลือกหมวดหมู่รายจ่ายก่อนทำรายการถอนเงิน";
    formMessage.textContent = "";
    formMessage.classList.remove("error");
  });
});

document.querySelectorAll(".quick-amounts button").forEach((button) => {
  button.addEventListener("click", () => {
    amountInput.value = button.dataset.amount;
    amountInput.focus();
  });
});

document.querySelectorAll(".chart-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".chart-tab").forEach((button) => {
      const selected = button === tab;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    renderChart(tab.dataset.period);
  });
});

clearAmountButton.addEventListener("click", () => {
  amountInput.value = "";
  amountInput.focus();
  formMessage.textContent = "";
  formMessage.classList.remove("error");
});

clearBalanceButton.addEventListener("click", () => {
  if (!storageReady) {
    showMessage("ไม่สามารถโหลดข้อมูลที่บันทึกไว้ได้ จึงไม่สามารถล้างยอดเงินได้", true);
    return;
  }

  const balance = calculateBalance(transactions);
  if (balance <= 0) {
    showMessage("ยอดเงินในบัญชีเป็น 0 บาทอยู่แล้ว", true);
    return;
  }

  const confirmed = window.confirm(
    `ยืนยันล้างเงินในบัญชีจำนวน ฿${currencyFormatter.format(balance)} บาท? รายการนี้จะถูกบันทึกในประวัติและไม่สามารถยกเลิกได้`,
  );
  if (!confirmed) return;

  const clearingTransaction = {
    type: "withdraw",
    amount: balance,
    category: "ล้างเงินในบัญชี",
    method: "ปรับยอดในกระเป๋าเงิน",
    timestamp: new Date().toISOString(),
  };
  const updatedTransactions = [clearingTransaction, ...transactions];

  if (!saveTransactions(updatedTransactions)) return;

  transactions = updatedTransactions;
  renderWallet();
  renderChart(document.querySelector(".chart-tab.active").dataset.period);
  showMessage("ล้างยอดเงินในบัญชีแล้ว และบันทึกรายการไว้ในประวัติ");
});

clearAllButton.addEventListener("click", () => {
  if (!storageReady) {
    showMessage("ไม่สามารถโหลดข้อมูลที่บันทึกไว้ได้ จึงไม่สามารถล้างข้อมูลทั้งหมดได้", true);
    return;
  }

  if (transactions.length === 0 && !amountInput.value && !expenseCategory.value) {
    showMessage("ไม่มีข้อมูลให้ล้าง", true);
    return;
  }

  const confirmed = window.confirm(
    "ยืนยันล้างข้อมูลทั้งหมดหรือไม่? ยอดเงิน กราฟ และประวัติจะถูกลบถาวร",
  );
  if (!confirmed) return;

  if (!saveTransactions([], defaultOpeningBalanceInSatang)) return;

  transactions = [];
  openingBalanceInSatang = defaultOpeningBalanceInSatang;
  amountInput.value = "";
  expenseCategory.value = "";
  renderWallet();
  renderChart(document.querySelector(".chart-tab.active").dataset.period);
  showMessage("ล้างยอดเงิน กราฟ และประวัติทั้งหมดแล้ว");
});

transferForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!storageReady) {
    showMessage("ไม่สามารถโหลดข้อมูลที่บันทึกไว้ได้ จึงปิดการทำรายการเพื่อป้องกันข้อมูลสูญหาย", true);
    return;
  }

  const amount = Math.round(Number(amountInput.value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("กรุณาระบุจำนวนเงินที่มากกว่า 0 บาท", true);
    amountInput.focus();
    return;
  }

  const type = transactionType.value;
  if (type === "withdraw" && !expenseCategory.value) {
    showMessage("กรุณาเลือกหมวดหมู่รายจ่าย", true);
    expenseCategory.focus();
    return;
  }

  const balance = calculateBalance(transactions);
  if (type === "withdraw" && amount > balance) {
    showMessage("ยอดเงินคงเหลือไม่เพียงพอสำหรับการถอน", true);
    amountInput.focus();
    return;
  }

  const transaction = {
    type,
    amount,
    category: type === "withdraw" ? expenseCategory.value : "",
    method: document.querySelector("#method-select").value.split(" •")[0],
    timestamp: new Date().toISOString(),
  };
  const updatedTransactions = [transaction, ...transactions];

  if (!saveTransactions(updatedTransactions)) return;

  transactions = updatedTransactions;
  renderWallet();
  renderChart(document.querySelector(".chart-tab.active").dataset.period);
  showMessage(type === "deposit"
    ? "จำลองการฝากเงินและบันทึกข้อมูลไว้ในอุปกรณ์นี้แล้ว"
    : "จำลองการถอนเงินและบันทึกข้อมูลไว้ในอุปกรณ์นี้แล้ว");
  amountInput.value = "";
});

function showMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);
}

function saveTransactions(items, openingBalance = openingBalanceInSatang) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      version: 2,
      openingBalanceInSatang: openingBalance,
      transactions: items,
    }));
    return true;
  } catch (error) {
    showMessage("บันทึกรายการไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์แล้วลองอีกครั้ง", true);
    return false;
  }
}

function loadTransactions() {
  try {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return;

    const parsedState = JSON.parse(savedState);
    if (!Array.isArray(parsedState.transactions) || !parsedState.transactions.every(isValidTransaction)) {
      throw new Error("Invalid saved wallet data");
    }

    if (parsedState.version === 1) {
      openingBalanceInSatang = defaultOpeningBalanceInSatang;
    } else if (
      parsedState.version === 2
      && Number.isSafeInteger(parsedState.openingBalanceInSatang)
      && parsedState.openingBalanceInSatang >= 0
    ) {
      openingBalanceInSatang = parsedState.transactions.length === 0
        && parsedState.openingBalanceInSatang === 0
        ? defaultOpeningBalanceInSatang
        : parsedState.openingBalanceInSatang;
    } else {
      throw new Error("Invalid saved wallet data");
    }

    transactions = parsedState.transactions;
  } catch (error) {
    storageReady = false;
    showMessage("อ่านข้อมูลที่บันทึกไว้ไม่ได้ ข้อมูลเดิมยังไม่ถูกเขียนทับ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์", true);
  }
}

function isValidTransaction(transaction) {
  return transaction !== null
    && typeof transaction === "object"
    && (transaction.type === "deposit" || transaction.type === "withdraw")
    && Number.isFinite(transaction.amount)
    && transaction.amount > 0
    && typeof transaction.category === "string"
    && typeof transaction.method === "string"
    && typeof transaction.timestamp === "string"
    && Number.isFinite(Date.parse(transaction.timestamp));
}

function calculateBalance(items) {
  const balanceInSatang = items.reduce((total, transaction) => {
    const amountInSatang = Math.round(transaction.amount * 100);
    return total + (transaction.type === "deposit" ? amountInSatang : -amountInSatang);
  }, openingBalanceInSatang);
  return balanceInSatang / 100;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateDailyTotals() {
  let todayIncome = 0;
  let todayExpense = 0;
  const today = getLocalDateKey(new Date());

  for (const transaction of transactions) {
    if (getLocalDateKey(new Date(transaction.timestamp)) !== today) continue;
    if (transaction.type === "deposit") {
      todayIncome += transaction.amount;
    } else {
      todayExpense += transaction.amount;
    }
  }

  return { todayIncome, todayExpense };
}

  function getChartPeriods(period, now = new Date()) {
    const count = period === "day" ? 7 : period === "month" ? 6 : 5;
    return Array.from({ length: count }, (_, index) => {
      const offset = count - index - 1;
      let start;
      let key;
      let label;

      if (period === "day") {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
        key = getLocalDateKey(start);
        label = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(start);
      } else if (period === "month") {
        start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
        label = new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" }).format(start);
      } else {
        start = new Date(now.getFullYear() - offset, 0, 1);
        key = String(start.getFullYear());
        label = new Intl.DateTimeFormat("th-TH", { year: "numeric" }).format(start);
      }

      return { key, label, income: 0, expense: 0 };
    });
  }

  function renderChart(period) {
    const periodDetails = {
      day: { description: "สรุปยอดรายวันในช่วง 7 วันที่ผ่านมา", ariaLabel: "กราฟแสดงรายรับและรายจ่ายรายวัน" },
      month: { description: "สรุปยอดรายเดือนในช่วง 6 เดือนที่ผ่านมา", ariaLabel: "กราฟแสดงรายรับและรายจ่ายรายเดือน" },
      year: { description: "สรุปยอดรายปีในช่วง 5 ปีที่ผ่านมา", ariaLabel: "กราฟแสดงรายรับและรายจ่ายรายปี" },
    }[period];
    chartDescription.textContent = periodDetails.description;
    chart.setAttribute("aria-label", periodDetails.ariaLabel);

    const buckets = getChartPeriods(period);
    const bucketsByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const transaction of transactions) {
      const date = new Date(transaction.timestamp);
      const key = period === "day"
        ? getLocalDateKey(date)
        : period === "month"
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
          : String(date.getFullYear());
      const bucket = bucketsByKey.get(key);
      if (bucket) bucket[transaction.type === "deposit" ? "income" : "expense"] += transaction.amount;
    }

    const hasTransactions = buckets.some((bucket) => bucket.income > 0 || bucket.expense > 0);
    chartEmpty.hidden = hasTransactions;
    chart.replaceChildren();

    const namespace = "http://www.w3.org/2000/svg";
    const svgElement = (name, attributes = {}) => {
      const element = document.createElementNS(namespace, name);
      for (const [attribute, value] of Object.entries(attributes)) {
        element.setAttribute(attribute, String(value));
      }
      return element;
    };
    const addText = (text, x, y, className, anchor = "middle") => {
      const element = svgElement("text", { x, y, class: className, "text-anchor": anchor });
      element.textContent = text;
      chart.append(element);
    };

    const width = 720;
    const height = 270;
    const left = 66;
    const right = 16;
    const top = 18;
    const bottom = 45;
    const plotHeight = height - top - bottom;
    const plotWidth = width - left - right;
    const largestValue = Math.max(...buckets.flatMap((bucket) => [bucket.income, bucket.expense]));
    const maximum = largestValue > 0 ? largestValue * 1.15 : 1;
    const gridCount = 4;
    const compactFormatter = new Intl.NumberFormat("th-TH", {
      notation: "compact",
      maximumFractionDigits: 1,
    });

    for (let index = 0; index <= gridCount; index += 1) {
      const ratio = index / gridCount;
      const y = top + plotHeight * ratio;
      const value = maximum * (1 - ratio);
      chart.append(svgElement("line", {
        x1: left,
        y1: y,
        x2: width - right,
        y2: y,
        class: "chart-gridline",
      }));
      addText(compactFormatter.format(value), left - 10, y + 4, "chart-axis-label", "end");
    }

    const step = plotWidth / buckets.length;
    const barWidth = Math.min(22, step * 0.25);
    const barGap = Math.min(6, step * 0.07);
    const baseline = top + plotHeight;

    buckets.forEach((bucket, index) => {
      const center = left + step * (index + 0.5);
      const entries = [
        { type: "income", value: bucket.income, className: "chart-income-bar", label: "รายรับ" },
        { type: "expense", value: bucket.expense, className: "chart-expense-bar", label: "รายจ่าย" },
      ];

      entries.forEach((entry, entryIndex) => {
        const barHeight = (entry.value / maximum) * plotHeight;
        const x = center + (entryIndex === 0 ? -barWidth - barGap / 2 : barGap / 2);
        const rect = svgElement("rect", {
          x,
          y: baseline - barHeight,
          width: barWidth,
          height: Math.max(barHeight, 0),
          rx: 4,
          class: entry.className,
        });
        const title = svgElement("title");
        title.textContent = `${bucket.label} · ${entry.label}: ฿${currencyFormatter.format(entry.value)}`;
        rect.append(title);
        chart.append(rect);
      });

      addText(bucket.label, center, baseline + 23, "chart-period-label");
    });
  }

function renderWallet() {
  const { todayIncome, todayExpense } = calculateDailyTotals();
  balanceAmount.textContent = `฿${currencyFormatter.format(calculateBalance(transactions))}`;
  incomeAmount.textContent = `฿${currencyFormatter.format(todayIncome)}`;
  expenseAmount.textContent = `฿${currencyFormatter.format(todayExpense)}`;

  historyBody.replaceChildren();
  if (transactions.length === 0) {
    const row = document.createElement("tr");
    row.className = "empty-history";
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "ยังไม่มีประวัติการทำรายการ";
    row.append(cell);
    historyBody.append(row);
    return;
  }

  for (const transaction of transactions) {
    const isIncome = transaction.type === "deposit";
    const row = document.createElement("tr");
    const transactionCell = document.createElement("td");
    transactionCell.className = "transaction-name";
    transactionCell.textContent = isIncome ? "ฝากเงิน" : "ถอนเงิน";

    const categoryCell = document.createElement("td");
    categoryCell.textContent = transaction.category || "—";

    const methodCell = document.createElement("td");
    methodCell.textContent = transaction.method;

    const dateCell = document.createElement("td");
    dateCell.textContent = dateTimeFormatter.format(new Date(transaction.timestamp));

    const amountCell = document.createElement("td");
    amountCell.className = `transaction-amount ${isIncome ? "income-text" : "expense-text"}`;
    amountCell.textContent = `${isIncome ? "+" : "−"}฿${currencyFormatter.format(transaction.amount)}`;

    row.append(transactionCell, categoryCell, methodCell, dateCell, amountCell);
    historyBody.append(row);
  }
}
