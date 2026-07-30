# frozen_string_literal: true

require 'date'
require 'varar'
require_relative '../../lib/library'

to_date = ->(raw) { Date.strptime(raw, '%B %d, %Y') }
format_date = ->(d) { "#{d.strftime('%B')} #{d.day}, #{d.year}" }

to_money = ->(raw) { raw.end_with?('p') ? Library.gbp(raw[0...-1].to_f / 100) : Library.gbp(raw[1..].to_f) }
format_money = ->(m) { m.value < 1 ? "#{(m.value * 100).round}p" : format('£%.2f', m.value) }

steps(-> { { loans: [], fee: Library.gbp(0), granted: false } }) do
  param('date', '[A-Z][a-z]+ \d{1,2}, \d{4}', parse: to_date, format: format_date)
  param('money', '£(?=.*\d.*)[-+]?\d*(?:\.(?=\d.*))?\d*|\d+p', parse: to_money, format: format_money)

  stimulus('borrowed {emph}, due back on {date}') do |state, title, due|
    state.merge(loans: state[:loans] + [{ title: title, due: due }])
  end

  stimulus('returns it on {date}') do |state, returned_on|
    fee = state[:loans].reduce(Library.gbp(0)) do |acc, loan|
      Library.add_money(acc, Library.late_fee(loan, returned_on))
    end
    state.merge(fee: fee)
  end

  sensor('owes a {money} late fee') { |state, _expected| state[:fee] }

  sensor('{money} for each day overdue') { |_state, _expected| Library::FEE_PER_DAY }

  stimulus('asks to borrow {emph} on {date}') do |state, _title, on|
    state.merge(granted: Library.may_borrow(state[:loans], on))
  end

  sensor('the library refuses') { |state| raise 'expected the library to refuse' if state[:granted] }

  sensor('the library agrees') { |state| raise 'expected the library to agree' unless state[:granted] }
end
