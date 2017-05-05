# monte-carlo-xct-fea-dK.R
#
# Copyright 2017 Confluent Medical Technologies, Inc
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# overview --------------------------------------------------------------------

# apply monte carlo techniques to estimate stress intensity factor K (aka SIF)
# and cyclic change in stress intensity factor dK 
# based on volumetric probabliity of stress derived from a specific FEA model
# combined with volumetric probability of defects derived from XCT scan

# IN:    *.ivol.csv post processed FEA results (from ../125-volumetric-analysis/)
# OUT:   *.mc.csv file in ./mc-out/ folder

# NEXT:  visualize results with visualize-monte-carlo.R

# Clear environment and load packages -----------------------------------------

# install required packages if necessary 
# install.packages('tidyverse')
# install.packages('rstudioapi')

rm(list=ls())
library(dplyr)           # http://r4ds.had.co.nz/
library(readr)

# settings --------------------------------------------------------------------

# number of montecarlo cases to run
# 10 runs in <30 seconds, 100 in < 1 hour, 1000 < 1 day
# (laptop class hardware)
monteCarloRuns <- 10

# material selection
# typically, change this then re-source the script
# to write results for both materials into one file
material <- 'eli' # se508 or eli

# set random numer seed to made results repeatable
# DISABLE THIS NEXT LINE TO GET RANDOM RESULTS WITH EACH RUN
# (it is enabled here only to make the output reproducible)
set.seed(42)

# two character prefix to filter files in inputPath
# symmetry factor for thisCode models
# input path for results data
# (these provisions are in place for managing groups of related results files,
# for example, different load cases for the same component, or different design
# variants subjected to the same load cases. in this example, we are considering
# only one file, so the code is not necessary)
thisCode <- 'OF'
inputPath <- '../125-volumetric-analysis/'
modelName <- 'open-frame-fatigue-v25mm-9pct'
symmetry <- 16

# gumbel parameter setup ------------------------------------------------------

# volumetric probability parameters from XCT analysis
# from ../210-xct-methods/out/gumbel-parameters.csv
# probV in particles per mm^3
# xy/yz/xz values based on micron^3
gumbel.se508 <- list(probV=7474.7403,
                     id='se508',
                     cutoff=8,
                     xy=list(mu=2.836400, s=1.3627438),
                     yz=list(mu=3.586776, s=1.9563104),
                     xz=list(mu=3.550664, s=1.8617355))
gumbel.eli <- list(probV=340.0763,
                   id='eli',
                   cutoff=8,
                   xy=list(mu=1.768962, s=0.4022094),
                   yz=list(mu=2.056096, s=0.3980918),
                   xz=list(mu=2.267019, s=0.4506382))

# gumbel distribution parameters for inclusion volume (cubic micron)
if(material == 'se508'){
  gumbel <- gumbel.se508
}else if(material == 'eli'){
  gumbel <- gumbel.eli
}else{
  gumbel <- NA
}

# set the volumetric probability for this case based on selected gumbel data set
probV <- gumbel$probV

# define quantile function for gumbel distribution
qgumbel <- function(p, mu, s){ # quantile function
  mu-s*log(-log(p))
}

# file and directory management -----------------------------------------------

# set working directory to location of this script
# note: this is problematic because in RStudio, the default working directory
# is the project folder, and this is one level down (so we will suffer from
# file-not-found errors if we don't fix this). There is not an easy fix.
# this approach requires the rstudioapi package. see also:
# http://stackoverflow.com/questions/13672720/r-command-for-setting-working-directory-to-source-file-location
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

# create folders for results if they do not already exist
dir.create('mc-out', showWarnings = FALSE)
logPath <- paste0('./mc-out/',modelName,'.mc.csv')

# if the output file doesn't exist, create the file and write the header
if(!file.exists(logPath)){
  headerLine <- paste('ident','matl','run','dK33.q50','dK33.q99','k33.q50','k33.q99',
                      'dK11.cycEA','dK11.cycSA','dK11.D','dK11.dS','dK11.dK','dK11.k','k11.k',
                      'dK22.cycEA','dK22.cycSA','dK22.D','dK22.dS','dK22.dK','dK22.k','k22.k',
                      'dK33.cycEA','dK33.cycSA','dK33.D','dK33.dS','dK33.dK','dK33.k','k33.k',
                      sep = ',')
  write_lines(headerLine, path = logPath)
}

# read files ending in *.ivol.csv from input path
files <- list.files(path = inputPath, pattern = "\\.ivol.csv$",
                    full.names = TRUE, recursive = FALSE)

# initialize empty list to hold input data
# this list will have one entry for each model "*.ivol.csv" in "files"
dfList <- list()
j <- 1

# read FEA results ------------------------------------------------------------

# read all of input data and detail for each model
# this loop reads in all the files in inputPath, and ignores
# files that do not start with the two letter prefix thisCode
# this step need to happen only once; all probabilistic calculations
# happen after this loop is complete

for(i in seq_along(files)){
  resultsFile <- files[i]
  baseName <- basename(resultsFile)
  ident <- 'OF-2017-01'             # model ident, in form AA-NNNN-NN
  code <- 'OF'                      # identifier, hard coded in this case
  
  # only process the CSV files with the correct prefix
  if(code == thisCode){
    # create a data frame (table) from the CSV
    # skip the header rows at the top of the file
    # use the strings in the next row as column names
    df <- read_csv(resultsFile, skip=46, col_names = TRUE) %>%
      # volume may be slightly different in the loading vs unloading steps
      # so create a new variable that is the average of loading and unloading
      # and multiply this by the symmetry factor to account for all of the
      # volume represented by each integration point
      mutate(cycV = (ldV + ulV)/2,
             cycV = cycV * symmetry)
    
    # preserve only the columns that we want
    df <- df %>%
      dplyr::select(el, ip, cycV, cycEA, cycSA,
                    ldS, ldS11, ldS22, ldS33,
                    ulS, ulS11, ulS22, ulS33) %>%
      # consider only tensile stresses; anything compressive is set to zero
      # revise columns in data frame to reflect only tensile stresses
      mutate(ldS11 = ifelse(ldS11 > 0, ldS11, 0),
             ldS22 = ifelse(ldS22 > 0, ldS22, 0),
             ldS33 = ifelse(ldS33 > 0, ldS33, 0),
             ulS11 = ifelse(ulS11 > 0, ulS11, 0),
             ulS22 = ifelse(ulS22 > 0, ulS22, 0),
             ulS33 = ifelse(ulS33 > 0, ulS33, 0)) %>%
      # calculate absolute value of delta tensile stress, add to data frame
      mutate(dS11 = abs(ldS11 - ulS11),
             dS22 = abs(ldS22 - ulS22),
             dS33 = abs(ldS33 - ulS33))
    
    # calcuate theoretical number of inclusions at each element/ip
    # and add this column to the data frame
    df <-  df %>%
      mutate(iProb = probV * cycV)
    
    # add the data for this model to the dfList
    # this is repeated for each result file
    dfList[[j]] <- list(df = df, baseName = baseName, ident = ident)
    
    # increment the model counter
    j = j+1
  }
}

# probability rounding function -----------------------------------------------

# function for rounding to the next higher or lower integer
# based on binomial probability. this is important below because
# many elements have a low probability of containing an inclusion, and
# simple rounding rules would result in assigning no inclusions to any
# such elements. with this function, 10% of elements having an inclusion
# probability of 0.1 will be assigned 1 inclusion, and 90% will be assigned
# zero inclusions.
roundProb <- function(x){
  xFloor <- floor(x)
  xDec <- (x-xFloor)
  zeroOne <- rbinom(1,size=1,prob=xDec)
  return(xFloor + zeroOne)
}

# probabilistic calculations --------------------------------------------------

# "roll the dice" monteCarloRuns times for all models
# in each run, inclusions of various sizes are assigned to each integration
# point, and we calculate K and dK according to the local stress and 
# effective defect size, in each of the coordinate planes

for(m in 1:monteCarloRuns){
  for(i in seq_along(dfList)){

    # for each row (integration point), convert the theoretical (floating point)
    # number of inclusions into an integer number, using the probabilistic rounding
    # function defined above.
    df <- dfList[[i]]$df %>% 
      rowwise() %>%
      mutate(iN = roundProb(iProb)
      )
    
    # confirm that the expected number of inclusions were created
    iCalculated <- sum(df$iN) # sum of inclusions created in this model
    iExpected <- probV*sum(df$cycV) # inclusions per mm^3 * total volume in mm^3
    iRatio <- iExpected / iCalculated # should be close to 1.0
    

    # Monte-Carlo
    # iN is the integer number of inclusions at the given integration point
    # first drop the rows for integration points  with no inclusions; these do not contribute
    # runif(iN) "rolls the dice" iN times, and returns iN values from a uniform distribution between 0 and 1
    # by taking max(runif(iN)), we choose the highest value, correcponding to the largest inclusion
    # we then give this value to the qgumbel() function to get the corresponding projected defect
    # size in the xy, yz, and xz planes
    # a handful of defect sizes will be a small negative value; discard these
    df <- df %>%
      filter(iN > 0) %>%
      mutate(rnd = max(runif(iN,0.0,1.0)),
             xyD = qgumbel(rnd,gumbel$xy$mu,gumbel$xy$s),
             yzD = qgumbel(rnd,gumbel$yz$mu,gumbel$yz$s),
             xzD = qgumbel(rnd,gumbel$xz$mu,gumbel$xz$s),
             xyD = ifelse(xyD<=0,0,xyD),
             yzD = ifelse(yzD<=0,0,yzD),
             xzD = ifelse(xzD<=0,0,xzD))
    
    # calculate K and dK for each defect, in units of MPa*sqrt(meter)
    # (to convert defect size in microns to meters, divide by 10^6)
    
    # Murakami Y, Endo M (1986) Effect of hardness and crack 
    # geometries on DKth of small cracks emanating from small defects
    # In: The Behavior of Short Fatigue Cracks, EGF Pub. 1, pp 275–293

    # M.F. Urbano, A. Cadelli, F. Sczerzenie, P. Luccarelli, S. Beretta, 
    # A. Coda, Inclusions Size-based Fatigue Life Prediction Model of NiTi Alloy 
    # for Biomedical Applications, Shape Mem. Superelasticity. 
    # 1 (2015) 1–12. doi:10.1007/s40830-015-0016-1.
    
    # 0.65 is "F" dimensionless factor that depends on shape and
    # position relative to surface (free edge). (see also Dowling chapter 8)
    
    # this could be improved by adjusting the 0.65 factor based on inclusion
    # depth from surface and/or shape characteristics
    
    df <- df %>%
      mutate(k11  = (0.65 * ldS11 * (pi * yzD/10^6)^0.5),
             k22  = (0.65 * ldS22 * (pi * xzD/10^6)^0.5),
             k33  = (0.65 * ldS33 * (pi * xyD/10^6)^0.5),
             dK11 = (0.65 * dS11 *  (pi * yzD/10^6)^0.5),
             dK22 = (0.65 * dS22 *  (pi * xzD/10^6)^0.5),
             dK33 = (0.65 * dS33 *  (pi * xyD/10^6)^0.5)
      )

    # find row index with maximum value of dK in each orientation
    dK11.row <- which.max(df$dK11)
    dK22.row <- which.max(df$dK22)
    dK33.row <- which.max(df$dK33)

    # find row index with maximum value of K in each orientation
    k11.row <- which.max(df$k11)
    k22.row <- which.max(df$k22)
    k33.row <- which.max(df$k33)

    # define summary output values, including median and 99th pctl dK and K
    # the axial orientation is selected because this is typically the most critical
    # signif() rounds values to the specified number of significant figures
    
    out.01 <- dfList[[i]]$ident                  # model id
    out.02 <- gumbel$id                          # material id
    out.03 <- m                                  # this run number
    out.04 <- signif(median(df$dK33),4)          # median dK in axial orientation
    out.05 <- signif(quantile(df$dK33,0.99),4)   # 99th percentile dK in axial orientation
    out.06 <- signif(median(df$k33),4)           # median K in axial orientation
    out.07 <- signif(quantile(df$k33,0.99),4)    # 99th percentile K in axial orientation

    # for the row (int pt) with the most critical dK in the 11 (radial) direction.
    # output the corresponding strain and stress amplitude, defect size, dK, and K
    # also output the absolute maximum (in the entire model) K value in the 11 direction.
        
    out.11 <- signif(df$cycEA[dK11.row],4)
    out.12 <- signif(df$cycSA[dK11.row],4)
    out.13 <- signif(df$yzD[dK11.row],4)
    out.14 <- signif(df$dS11[dK11.row],4)
    out.15 <- signif(df$dK11[dK11.row],4)
    out.16 <- signif(df$k11[dK11.row],4)     
    out.17 <- signif(df$k11[k11.row],4)     
    
    # repeat for 22 (theta) direction
    
    out.21 <- signif(df$cycEA[dK22.row],4)
    out.22 <- signif(df$cycSA[dK22.row],4)
    out.23 <- signif(df$xzD[dK22.row],4)
    out.24 <- signif(df$dS22[dK22.row],4)
    out.25 <- signif(df$dK22[dK22.row],4)
    out.26 <- signif(df$k22[dK22.row],4)    
    out.27 <- signif(df$k22[k22.row],4)   
    
    # repeat for 33 (axial) direction
    
    out.31 <- signif(df$cycEA[dK33.row],4)
    out.32 <- signif(df$cycSA[dK33.row],4)
    out.33 <- signif(df$xyD[dK33.row],4)
    out.34 <- signif(df$dS33[dK33.row],4)
    out.35 <- signif(df$dK33[dK33.row],4)
    out.36 <- signif(df$k33[dK33.row],4) 
    out.37 <- signif(df$k33[k33.row],4)
    
    # assemble line to write to output fi;e
    
    lineToWrite <- paste(out.01,out.02,out.03,out.04,out.05,out.06,out.07,
                         out.11,out.12,out.13,out.14,out.15,out.16,out.17,
                         out.21,out.22,out.23,out.24,out.25,out.26,out.27,
                         out.31,out.32,out.33,out.34,out.35,out.36,out.37,
                         sep = ',')
    
    # log results to CSV
    # we intentionally append, rather than overwrite the file
    # to allow this script to be run multiple times, each time considering
    # a different material. or, it can be run multiple times to generate
    # additional montecarlo runs; if this is the intent, set.seed() should
    # be commented out, otherwise the results will be the same every time.
    write_lines(lineToWrite, path = logPath, append = TRUE)

  }
}

# thoughts --------------------------------------------------------------------

# this approach demonstrates the concept well enough...
# but it can probably be much more computationally efficient
# for example, we can simply find the largest possible (or 99th pctl)
# inclusion, and place it at the lighest stress, and measure the resulting
# K and dK. still need to work out a simpler way at calculating a 
# probability of such an event (or event of somewhat less, but still critical)
# severity.
