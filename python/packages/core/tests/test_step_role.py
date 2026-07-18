"""Port of typescript/packages/core/tests/step-role.test.ts.

`infer_step_role` is purely structural: a step with nothing after it is the
observation (sensor); anything followed by other steps is driving the software
(stimulus)."""

from varar_core.step_role import infer_step_role


def test_nothing_after_means_sensor_expectation_last():
    assert infer_step_role({"before": ["stimulus"], "after": []}) == "sensor"


def test_no_neighbours_at_all_means_sensor():
    assert infer_step_role({"before": [], "after": []}) == "sensor"


def test_steps_follow_means_stimulus():
    assert infer_step_role({"before": [], "after": ["sensor"]}) == "stimulus"


def test_steps_on_both_sides_means_stimulus():
    assert infer_step_role({"before": ["stimulus"], "after": ["stimulus"]}) == "stimulus"
