# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name = "oselvar-var-config"
  s.version = "0.3.2"
  s.summary = "Markdown-native BDD — var.config.json reader"
  s.description = "Strict, fail-loud reader for the shared var.config.json format."
  s.authors = ["Aslak Hellesøy"]
  s.email = ["aslak@oselvar.com"]
  s.homepage = "https://var.oselvar.com"
  s.license = "MIT"
  s.required_ruby_version = ">= 3.2"
  s.files = Dir["lib/**/*.rb"]
  s.require_paths = ["lib"]
end
