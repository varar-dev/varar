# frozen_string_literal: true

module Yahtzee
  module_function

  def score(dice, category)
    counts = Hash.new(0)
    dice.each { |d| counts[d] += 1 }
    total = dice.sum
    sum_of = ->(face) { counts[face] * face }
    of_a_kind = lambda do |n|
      faces = counts.select { |_face, c| c >= n }.keys
      faces.empty? ? 0 : n * faces.max
    end
    sorted_dice = dice.sort.join

    case category
    when 'ones' then sum_of.call(1)
    when 'twos' then sum_of.call(2)
    when 'threes' then sum_of.call(3)
    when 'fours' then sum_of.call(4)
    when 'fives' then sum_of.call(5)
    when 'sixes' then sum_of.call(6)
    when 'pair' then of_a_kind.call(2)
    when 'two pairs'
      pairs = counts.select { |_face, c| c >= 2 }.keys
      pairs.length >= 2 ? pairs.sum { |face| 2 * face } : 0
    when 'three of a kind' then of_a_kind.call(3)
    when 'four of a kind' then of_a_kind.call(4)
    when 'small straight' then sorted_dice == '12345' ? 15 : 0
    when 'large straight' then sorted_dice == '23456' ? 20 : 0
    when 'full house'
      counts.size == 2 && counts.values.sort == [2, 3] ? total : 0
    when 'Yahtzee' then counts.size == 1 ? 50 : 0
    when 'chance' then total
    else raise ArgumentError, "Unknown category: #{category}"
    end
  end
end
