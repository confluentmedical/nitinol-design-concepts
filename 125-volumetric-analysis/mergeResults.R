# mergeResults.R

# Copyright 2017 Confluent Medical Technologies
# Released as part of nitinol-design-concepts
# https://github.com/confluentmedical/nitinol-design-concepts
# under terms of Apache 2.0 license
# http://www.apache.org/licenses/LICENSE-2.0.txt

# merges results from postprocessing of multiple FEA models into a single table
#
# IN:   *.csv files in ./out folder
# OUT:  (baseName).csv file in ./out/summary folder

# load packages
library(tidyverse)

# set working directory to location of this script
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

# set baseName for saving results
baseName <- 'open-frame-fatigue'

files <- list.files(path = "./out", full.names = TRUE, recursive = FALSE)

for(i in seq_along(files)){
  thisNchar <- nchar(files[i])
  thisExt <- substring(files[i],thisNchar-3,thisNchar)
  if(thisExt == '.csv'){
    
    thisDf <- read_csv(files[i], col_names = TRUE)
    thisTdf <- as_tibble(t(thisDf))
    thisTdf <- thisTdf[2,]
    colnames(thisTdf) <- thisDf$label
    
    if(!exists('dfX')){
      dfX <- thisTdf
    }else
      dfX <- bind_rows(dfX, thisTdf)
  
  }
}

# make a summary directory to keep results file separate from input CSV's
dir.create('./out/summary', showWarnings = FALSE)
write_csv(dfX, path = paste('./out/summary/',baseName,'.csv',sep = ''), na='0')
