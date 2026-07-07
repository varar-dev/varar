# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name = "oselvar-var-runner"
  s.version = "0.3.2"
  s.summary = "Markdown-native BDD — imperative shell (discovery, loading, drift)"
  s.description = "Spec/step discovery, step loading, planning, failure rendering, and the filesystem drift baseline store."
  s.authors = ["Aslak Hellesøy"]
  s.email = ["aslak@oselvar.com"]
  s.homepage = "https://var.oselvar.com"
  s.license = "MIT"
  s.required_ruby_version = ">= 3.2"
  s.files = Dir["lib/**/*.rb"]
  s.require_paths = ["lib"]

  s.add_dependency "oselvar-var", "0.3.2"
  s.add_dependency "oselvar-var-config", "0.3.2"
end
