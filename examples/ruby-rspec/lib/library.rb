# frozen_string_literal: true

require 'date'

module Library
  Money = Data.define(:currency, :value)

  module_function

  def gbp(value)
    Money.new(currency: 'GBP', value: value)
  end

  FEE_PER_DAY = gbp(0.5)

  def add_money(a, b)
    raise ArgumentError, "cannot add #{b.currency} to #{a.currency}" if a.currency != b.currency

    Money.new(currency: a.currency, value: a.value + b.value)
  end

  # Fee for returning a loan: 50p per day past the due date.
  def late_fee(loan, returned_on)
    days_late = [0, (returned_on - loan[:due]).to_i].max
    gbp(days_late * FEE_PER_DAY.value)
  end

  # A member may borrow as long as none of their loans is overdue.
  def may_borrow(loans, on)
    loans.all? { |loan| loan[:due] >= on }
  end
end
