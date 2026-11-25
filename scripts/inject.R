# Puts one data document into a packaged report template, as scripts/inject.mjs does, in base R alone. Both work on
# bytes: the document is copied unchanged except that each `<` becomes <, so the two write identical files.
# Base R has no JSON parser, so unlike the Node injector this one does not check the document; the report does when it
# loads.
# Usage: Rscript scripts/inject.R <template.html> <document.json> <out.html>

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 3L) stop("usage: Rscript scripts/inject.R <template.html> <document.json> <out.html>", call. = FALSE)

read_bytes <- function(path) readBin(path, "raw", n = file.size(path))
template <- read_bytes(args[[1L]])
text <- read_bytes(args[[2L]])

placeholder <- charToRaw("__GSM_DATA__")
at <- grepRaw(placeholder, template, fixed = TRUE)
if (!length(at)) stop("the template has no __GSM_DATA__ placeholder", call. = FALSE)
if (length(grepRaw(placeholder, template, offset = at + 1L, fixed = TRUE))) {
  stop("the template has more than one __GSM_DATA__ placeholder", call. = FALSE)
}

# Each `<` is first repeated six times, then those six bytes are overwritten with the escape.
escape <- charToRaw("\\u003c")
lt <- which(text == charToRaw("<"))
widths <- rep(1L, length(text))
widths[lt] <- length(escape)
escaped <- rep(text, widths)
escaped[rep(cumsum(widths)[lt] - length(escape), each = length(escape)) + seq_along(escape)] <- escape

out <- c(template[seq_len(at - 1L)], escaped, template[-seq_len(at + length(placeholder) - 1L)])
writeBin(out, args[[3L]])
cat(sprintf("Wrote %s\n", args[[3L]]))
