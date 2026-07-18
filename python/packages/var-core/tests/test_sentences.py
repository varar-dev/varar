"""Port of typescript/packages/var-core/tests/sentences.test.ts (plus the
astral-offset case the Java/Rust ports added)."""

from var_core.sentences import Sentence, split_sentences


def _texts(sentences):
    return [s.text for s in sentences]


def test_splits_a_paragraph_on_periods_question_marks_exclamation_marks():
    result = split_sentences("First sentence. Second one? Third one!")
    assert _texts(result) == ["First sentence.", "Second one?", "Third one!"]


def test_keeps_offsets_relative_to_the_input_text():
    result = split_sentences("Alpha. Beta.")
    assert result == (
        Sentence(text="Alpha.", start_offset=0, end_offset=6),
        Sentence(text="Beta.", start_offset=7, end_offset=12),
    )


def test_does_not_split_inside_numeric_literals():
    result = split_sentences("The price is $1.50 today.")
    assert _texts(result) == ["The price is $1.50 today."]


def test_does_not_split_on_common_abbreviations():
    result = split_sentences("Use e.g. coffee. It works.")
    assert _texts(result) == ["Use e.g. coffee.", "It works."]


def test_treats_a_blank_line_as_a_sentence_boundary():
    result = split_sentences("First.\n\nSecond.")
    assert _texts(result) == ["First.", "Second."]


def test_treats_a_backtick_code_span_as_a_single_token():
    result = split_sentences("Run `npm test` first. Then `git push`.")
    assert _texts(result) == ["Run `npm test` first.", "Then `git push`."]


def test_the_final_sentence_does_not_require_a_terminator():
    result = split_sentences("Alpha. Beta")
    assert _texts(result) == ["Alpha.", "Beta"]


def test_does_not_split_on_terminators_inside_a_double_quoted_string():
    result = split_sentences('Alpha "with . and ? inside" beta. Gamma.')
    assert _texts(result) == ['Alpha "with . and ? inside" beta.', "Gamma."]


def test_splits_on_a_single_newline_gherkin_style_line_per_step():
    result = split_sentences('Given I greet "world"\nThen the greeting is "Hello, world!"')
    assert _texts(result) == [
        'Given I greet "world"',
        'Then the greeting is "Hello, world!"',
    ]


def test_splits_between_terminators_outside_quoted_strings_ignoring_those_inside():
    result = split_sentences('Alpha "with ! inside". Beta "and ? inside"!')
    assert _texts(result) == ['Alpha "with ! inside".', 'Beta "and ? inside"!']


def test_astral_character_keeps_utf16_offsets_correct():
    # 🎉 is one code point but two UTF-16 code units, so the first sentence's
    # end offset is 14 (11 + 2 + 1), matching the sibling ports.
    text = "Party time 🎉! Next one."
    result = split_sentences(text)
    assert _texts(result) == ["Party time 🎉!", "Next one."]
    assert result[0].start_offset == 0
    assert result[0].end_offset == 14
