const Classification = require('./Classification')

class CountyClassification extends Classification {
  constructor (confidence, meta) {
    super(confidence, meta)
    this.public = true
    this.label = 'county'
  }
}

module.exports = CountyClassification
