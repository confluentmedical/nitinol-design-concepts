# xct-process-imagej-results.R ------------------

# Copyright 2017 Confluent Medical Technologies
# Released as part of nitinol-design-concepts
# https://github.com/confluentmedical/nitinol-design-concepts
# under terms of Apache 2.0 license
# http://www.apache.org/licenses/LICENSE-2.0.txt

# summarize and visualize inclusion distributions, orientation, etc
# explore extreme value distributions
#
# IN:  ./image-data/*-mask-histogram.tsv
#         - table results for mask histogram. 
#         - count of pixel value 0 represents masked voxels
#         - count of pixel value 255 represents matrix voxels
#      ./image-data/*-lbl-morpho.tsv
#         - results table from MorphoLibJ particle analysis 3D
#      ./image-data/*-lbl-bounds.tsv
#         - results table from MorphoLibJ bounding box analysis
# OUT: ./out/count-by-scan.csv
#      ./out/count-by-type.csv
#      ./out/gumbel-parameters.csv
#      ./out/hist-count-loglog.pdf
#      ./out/hist-count-loglog.pdf

# Setup -----------------------------------------

library(fitdistrplus) # for fitting Gumbel distribution
library(tidyverse)    # http://r4ds.had.co.nz/
rm(list=ls())

cutoffVolume <- 8 # filter out particles less than this value (cubic microns)

umPerVoxel <- 0.500973555972 # voxel edge size from scan (microns)
cubicUmPerVoxel <- (umPerVoxel^3)

factorID <- c('scan01','scan02','scan03') # valid file name prefixes
factorDesc <-c('SE508','SE508ELI') # valid descriptions

# set working directory to location of this script
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

# create output directory if it does not exist
dir.create('./out', showWarnings = FALSE)

# getSegmentation -------------------------------
# function to read segmentation details from specified tab separated value (.tsv) files
# baseName is the file name prefix (from the set factorID)
# description is the material description (from the set factorDesc)

getSegmentation <- function(baseName, description){
  # read volume information from histogram file
  # total volume is about 0.42mm^3, of which 0.25mm^3 is matrix
  # exact volumes vary depending on the mask used for each scan
  histogram000 <- read_tsv(paste0('./image-data/',baseName,'-mask-histogram.tsv'),skip=1,col_names=FALSE)
  histogram255 <- read_tsv(paste0('./image-data/',baseName,'-mask-histogram.tsv'),skip=256,col_names=FALSE)
  voxels000 <- histogram000[[1,2]]
  volume000 <- voxels000 * cubicUmPerVoxel
  voxels255 <- histogram255[[1,2]]
  volume255 <- voxels255 * cubicUmPerVoxel
  totalVolume <- volume255 + volume000
  matrixVolume <- volume255
  
  # read morphology data (MorphoLibJ > Analysis > Particle Analysis 3D)
  # organize into a new data table called morpho
  morpho <- read_tsv(paste0('./image-data/',baseName,'-lbl-morpho.tsv'),col_names=TRUE)
  
  # read bounding box data (MorphoLibJ > Analysis > Bounding Box 3D)
  # convert voxels to microns and combine with morphology data
  # add to morphology data table
  bounds <- read_tsv(paste0('./image-data/',baseName,'-lbl-bounds.tsv'),col_names=TRUE) %>%
    mutate(xBox = (XMax-XMin)*umPerVoxel,
           yBox = (YMax-YMin)*umPerVoxel,
           zBox = (ZMax-ZMin)*umPerVoxel) %>%
    select(xBox,yBox,zBox)
  morpho <- bind_cols(morpho,bounds)
  
  # finally, add the total matrix volume in the last column
  morpho <- morpho %>%
    mutate(vMatrix = matrixVolume)
  
  # prepend first and second columns to identify this data set
  morpho <- morpho %>%
    mutate(scanID = baseName,
           scanDesc = description) %>%
    select(scanID, scanDesc, everything(), -X1)
  
  return(morpho)
}

# Read XCT data ---------------------------------
# create a new data frame called xct
# that binds together results from the selected data sets
# using the getSegmentation routine from above

xct <-      getSegmentation('scan01','SE508') %>%
  bind_rows(getSegmentation('scan02','SE508ELI')) %>%
  bind_rows(getSegmentation('scan03','SE508ELI')) %>%
  filter(Volume > cutoffVolume) %>%
  mutate(vPerCuMm = Volume / 1e9)

# convert scanID and scanDesc columns into factors
xct <- xct %>%
  mutate(scanID = parse_factor(scanID, levels = factorID),
         scanDesc = parse_factor(scanDesc, levels = factorDesc))

# Create histogram plots ------------------------

p.count <- ggplot(xct) +
  geom_histogram(aes(Volume,fill=scanID)) +
  facet_grid(scanID ~ .) +
  xlab('inclusion size (cubic micron)') +
  ylab('inclusion count') +
  ggtitle('inclusion count by size')
plot(p.count)

p.vol <- ggplot(xct) +
  geom_histogram(aes(Volume,fill=scanID,weight=Volume)) +
  facet_grid(scanID ~ .) +
  xlab('inclusion size (cubic micron)') +
  ylab('sum of inclusion volume (cubic micron)') +
  ggtitle('inclusion volume by size')
plot(p.vol)

p.count.ll <- ggplot(xct) +
  geom_histogram(aes(Volume,fill=scanID)) +
  facet_grid(scanID ~ .) +
  scale_y_log10() +
  scale_x_log10(limits = c(1,NA)) +
  xlab('inclusion size (cubic micron)') +
  ylab('inclusion count') +
  ggtitle('inclusion count by size')
plot(p.count.ll)
ggsave('./out/hist-count-loglog.pdf',width = 6,height = 4)
ggsave('./out/hist-count-loglog.png',width = 6,height = 4)

p.vol.ll <- ggplot(xct) +
  geom_histogram(aes(Volume,fill=scanID,weight=Volume)) +
  facet_grid(scanID ~ .) +
  scale_y_log10() +
  scale_x_log10(limits = c(1,NA)) +
  xlab('inclusion size (cubic micron)') +
  ylab('sum of inclusion volume (cubic micron)') +
  ggtitle('inclusion volume by size')
plot(p.vol.ll)
ggsave('./out/hist-volume-loglog.pdf',width = 6,height = 4)
ggsave('./out/hist-volume-loglog.png',width = 6,height = 4)

# Summarize inclusion density -------------------

# create a table of inclusion count for each scan
# each row represents a particle (inclusion), so counting
# the rows provides the total number of inclusions
inclusionCount <- count(xct, scanID)

# summarize the XCT data
# use max(vMatrix) to grab the max (only) value for matrix volume
# calculate density in terms of cubic microns and cubic millimeters
countByScan <- xct %>%
  group_by(scanID,scanDesc) %>%
  summarize(vMatrix = max(vMatrix)) %>%
  bind_cols(inclusionCount[,2]) %>%
  mutate(nPerUm3 = n/vMatrix,
         nPerMm3 = nPerUm3 * 1e9)

# print summary table by scan
print(countByScan)

# repeat the above, now summarizing by description
# this combines results for multiple scans of the same description
# and summarizes the combined result
countByDesc <- xct %>%
  group_by(scanID,scanDesc) %>%
  summarize(vMatrix = max(vMatrix)) %>%
  bind_cols(inclusionCount[,2]) %>%
  ungroup() %>%
  group_by(scanDesc) %>%
  summarize(vMatrix = sum(vMatrix),
            n = sum(n)) %>%
  mutate(nPerUm3 = n/vMatrix,
         nPerMm3 = nPerUm3 * 1e9)

# print summary table by description
print(countByDesc)


# write results to CSV files  -------------------

write_csv(countByScan, path = paste('./out/','count-by-scan',
                                    '.csv',sep = ''), na='0')
write_csv(countByDesc, path = paste('./out/','count-by-type',
                                    '.csv',sep = ''), na='0')


# Estimate projected area -----------------------

# estimate projected area in each plane by dividing
# the volume by the orthoganal bounding box dimension
# then calculate the root area for later use in K formula
xct <- xct %>%
  mutate(xyArea = Volume / zBox, # area projected in XY plane (transverse)
         xzArea = Volume / yBox, # area projected in XZ plane (longitudinal)
         yzArea = Volume / xBox, # area projected in YZ plane (longitudinal)
         rootXyArea = xyArea^(1/2),
         rootXzArea = xzArea^(1/2),
         rootYzArea = yzArea^(1/2))

# create gumbel functions -----------------------
# http://stats.stackexchange.com/questions/71197/
# usable-estimators-for-parameters-in-gumbel-distribution
dgumbel <- function(x,mu,s){ # PDF
  exp((mu - x)/s - exp((mu - x)/s))/s
}

pgumbel <- function(q,mu,s){ # CDF
  exp(-exp(-((q - mu)/s)))
}

qgumbel <- function(p, mu, s){ # quantile function
  mu-s*log(-log(p))
}

# helper function for fitting Gumbel distribution
gumbelFit <- function(vector){
  fit <- fitdist(vector, "gumbel",
                 start=list(mu=4, s=1),
                 method="mle")
  return(fit)
}

# gumbel fits and plots -------------------------
# code from here down is quite inelegant and tailored
# to this specific example

# split into separate data frames for each material
xct.se508 <- filter(xct,scanDesc=='SE508')
xct.eli <- filter(xct,scanDesc=='SE508ELI')

# gumbel fit for root area (in microns)
# for each material and each plane
gumbel.se508.xz <- gumbelFit(xct.se508$rootXzArea)
gumbel.se508.yz <- gumbelFit(xct.se508$rootYzArea)
gumbel.se508.xy <- gumbelFit(xct.se508$rootXyArea)
gumbel.eli.xz <- gumbelFit(xct.eli$rootXzArea)
gumbel.eli.yz <- gumbelFit(xct.eli$rootYzArea)
gumbel.eli.xy <- gumbelFit(xct.eli$rootXyArea)

# assemble a summary table for 2 materials * 3 planes = 6 items
# columns will be assembled from vectors with 6 items each

# vector for material identification
# repeat se508 3x, and eli 3x
v.matl <- c(rep('se508',3),rep('eli',3))

# vector number of particles per mm^3 for each material
n.SE508 <- countByDesc[countByDesc$scanDesc=='SE508','nPerMm3'][[1]]
n.SE508ELI <- countByDesc[countByDesc$scanDesc=='SE508ELI','nPerMm3'][[1]]
v.nPerMm3 <- c(rep(n.SE508,3),
               rep(n.SE508ELI,3))

# three planes for each of the two materials
v.plane <- c(rep(c('xy','yz','xz'),2))

# vector for the cutoff volume 
v.cutoff <- c(rep(cutoffVolume,6))

# helper function to extract "mu" parameter estimate from Gumbel model
gumbelMu <- function(gumbelModel){
  return(gumbelModel$estimate[[1]])
}

# helper function to extract "s" parameter estimate from Gumbel model
gumbelS <- function(gumbelModel){
  return(gumbelModel$estimate[[2]])
}

# vector of mu parameter for each case
v.mu <- c(gumbelMu(gumbel.se508.xy),
          gumbelMu(gumbel.se508.yz),
          gumbelMu(gumbel.se508.xz),
          gumbelMu(gumbel.eli.xy),
          gumbelMu(gumbel.eli.yz),
          gumbelMu(gumbel.eli.xz)) 

# vector of s parameter for each case
v.s <- c(gumbelS(gumbel.se508.xy),
         gumbelS(gumbel.se508.yz),
         gumbelS(gumbel.se508.xz),
         gumbelS(gumbel.eli.xy),
         gumbelS(gumbel.eli.yz),
         gumbelS(gumbel.eli.xz)) 

# new data frame combining all of these vectors
dfGumbel <- bind_cols(as_tibble(v.matl),as_tibble(v.plane),
                      as_tibble(v.cutoff),
                      as_tibble(v.nPerMm3), as_tibble(v.mu),as_tibble(v.s))
colnames(dfGumbel) <- c('matl', 'plane', 'cutoff', 'nPerMm3', 'mu', 's')

# write volumetric probaiblity and gumbel parameter results to CSV
# this table includes all the necessary information to create
# probabilistic estimates for the presence and size of particles
# at each element in a monte-carlo simulation

write_csv(dfGumbel, path = paste('./out/','gumbel-parameters',
                                 '.csv',sep = ''), na='0')
