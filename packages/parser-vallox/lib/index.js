const { Transform } = require('stream')

/**
 * Emit data every number of bytes
 * @extends Transform
 * @param {Object} options parser options object
 * @param {Number} options.length the number of bytes on each data event
 * @summary A transform stream that emits data as a buffer after a specific number of bytes are received. Runs in O(n) time.
 * @example
const SerialPort = require('serialport')
const ValloxParser = require('@serialport/parser-vallox')
const port = new SerialPort('/dev/tty-usbserial1')
const parser = port.pipe(new ByteLength({length: 6}))
parser.on('data', console.log) // will have 6 bytes per data event

Vallox protocol is always 6 bytes long
The checksum is in the last byte and calculated adding bytes 0 - 4 masking the result with 0xff
The parser is synching until it finds a sequence with matching crc. 
After this it emits always 6 bytes until the checksum failed three times in a row.
After that it synchronizes again.

 */
class ValloxParser extends Transform {
  constructor(options = {}) {
    super(options)

    if (typeof options.length !== 'number') {
      throw new TypeError('"length" is not a number')
    }

    if (options.length < 1) {
      throw new TypeError('"length" is not greater than 0')
    }

    this.length = options.length
    this.position = 0
    this.buffer = Buffer.alloc(this.length * 2)
    this.synch = false
    this.cursorshift = 0
  }

  _transform(chunk, encoding, cb) {
    let cursor = 0

    while (cursor < chunk.length) {
      this.buffer[this.position] = chunk[cursor]
      cursor++
      this.position++

      // Find a sequence with matching crc in the stream to synchronize
      if (this.position >= this.length && !this.synch) {
        // calculate the checksum
        let crccursor = 0
        let checksum = 0
        while (crccursor < this.length - 1) {
          checksum += this.buffer[this.cursorshift + crccursor]
          crccursor++
        }
        checksum = checksum & 0xff
        if (checksum == this.buffer[this.cursorshift + crccursor]) {
          this.synch = true
          this.datagram = Buffer.alloc(this.length)
          let buffercursor = this.cursorshift + crccursor
          let datagramcursor = this.length - 1
          while (datagramcursor >= 0) {
            this.datagram[datagramcursor--] = this.buffer[buffercursor--]
          }
          this.push(this.datagram)
          this.buffer = Buffer.alloc(this.length)
          this.position = 0
        } else {
          this.cursorshift++
        }
      }

      // push buffer if synched and length bytes received
      if (this.position == this.length && this.synch) {
        let buffercursor = 0
        let chksum = 0
        while (buffercursor < this.length - 1) {
          chksum += this.buffer[buffercursor++]
        }
        if (chksum == this.buffer[buffercursor]) {
          this.push(this.buffer)
          this.buffer = Buffer.alloc(this.length)
          this.position = 0
        } else {
          this.chksumerror++
          this.synch = false
          this.buffer = Buffer.alloc(this.length * 2)
          this.position = 0
          this.cursorshift = 0
        }
      }
    }
    cb()
  }

  _flush(cb) {
    this.push(this.buffer.slice(0, this.position))
    this.buffer = Buffer.alloc(this.length)
    cb()
  }
}

module.exports = ValloxParser
