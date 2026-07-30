use super::Ctx;
use ::varar::Steps;

pub fn register(s: &mut Steps<Ctx>) {
    // A whole-table slot arrives as rows of cells, and the computed table goes
    // back the same way — compared positionally against the input's columns.
    s.sensor("Uppercase each one:", |_ctx: Ctx, table: Vec<Vec<String>>| {
        Ok(table
            .iter()
            .skip(1)
            .map(|row| vec![row[0].clone(), row[0].to_uppercase()])
            .collect::<Vec<Vec<String>>>())
    });

    // Two slots — the {word} capture and the trailing doc string — so two
    // strings in, two strings out, compared positionally.
    s.sensor("Greet {word}:", |_ctx: Ctx, name: String, _doc: String| {
        let greeting = format!("Hello, {name}!\n");
        Ok((name, greeting))
    });
}
