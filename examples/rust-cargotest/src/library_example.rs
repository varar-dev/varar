pub const FEE_PER_DAY: i64 = 50;

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Date {
    pub year: i64,
    pub month: i64,
    pub day: i64,
}

impl Date {
    pub fn serial(self) -> i64 {
        let (y, m, d) = (self.year, self.month, self.day);
        let y = if m <= 2 { y - 1 } else { y };
        let era = (if y >= 0 { y } else { y - 399 }) / 400;
        let yoe = y - era * 400;
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe - 719468
    }
}

pub fn parse_date(raw: &str) -> Date {
    let (month_day, year) = raw
        .split_once(", ")
        .unwrap_or_else(|| panic!("not a date: {raw}"));
    let (month, day) = month_day
        .split_once(' ')
        .unwrap_or_else(|| panic!("not a date: {raw}"));
    let month = MONTHS
        .iter()
        .position(|m| *m == month)
        .unwrap_or_else(|| panic!("not a month: {month}")) as i64
        + 1;
    Date {
        year: year.parse().expect("year"),
        month,
        day: day.parse().expect("day"),
    }
}

pub fn format_date(d: Date) -> String {
    format!("{} {}, {}", MONTHS[(d.month - 1) as usize], d.day, d.year)
}

pub fn parse_money(raw: &str) -> i64 {
    if let Some(pence) = raw.strip_suffix('p') {
        pence.parse().expect("pence")
    } else if let Some(pounds) = raw.strip_prefix('£') {
        (pounds.parse::<f64>().expect("pounds") * 100.0).round() as i64
    } else {
        panic!("not money: {raw}")
    }
}

pub fn format_money(pennies: i64) -> String {
    if pennies < 100 {
        format!("{pennies}p")
    } else {
        format!("£{:.2}", pennies as f64 / 100.0)
    }
}

pub fn late_fee(due: Date, returned_on: Date) -> i64 {
    let days_late = (returned_on.serial() - due.serial()).max(0);
    days_late * FEE_PER_DAY
}

pub fn may_borrow(dues: &[Date], on: Date) -> bool {
    dues.iter().all(|due| due.serial() >= on.serial())
}
