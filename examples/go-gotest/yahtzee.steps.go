package example

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func registerYahtzee(s *varar.Steps) {
	s.Sensor("Examples of dice, category and score", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		row := args[0].CloneMap()
		var dice []int64
		for _, d := range strings.Split(row["dice"].MustString(), ",") {
			n, err := strconv.ParseInt(strings.TrimSpace(d), 10, 64)
			if err != nil {
				return nil, fmt.Errorf("not a die: %s", d)
			}
			dice = append(dice, n)
		}
		category := row["category"].MustString()
		return varar.Ptr(varar.MapValue(map[string]varar.Value{
			"score": varar.IntValue(Score(dice, category)),
		})), nil
	})
}
