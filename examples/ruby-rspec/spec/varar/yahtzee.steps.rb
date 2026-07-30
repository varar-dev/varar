# frozen_string_literal: true

require 'varar'
require_relative '../../lib/yahtzee'

steps do
  sensor('Examples of dice, category and score') do |_state, row|
    dice = row['dice'].split(',').map { |d| d.strip.to_i }
    { 'score' => Yahtzee.score(dice, row['category']) }
  end
end
