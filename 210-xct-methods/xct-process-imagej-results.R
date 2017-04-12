# xct-process-imagej-results.R ------------------
#
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
# OUT: tbd

# Setup -----------------------------------------

library(tidyverse)
rm(list=ls())

cutoffVolume <- 8 # filter out particles less than this value (cubic microns)

umPerVoxel <- 0.500973555972 # voxel edge size from scan (microns)
cubicUmPerVoxel <- (umPerVoxel^3)

factorID <- c('scan01','scan02','scan03') # valid file name prefixes
factorDesc <-c('SE508','SE508ELI') # valid descriptions

# set working directory to location of this script
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

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
  filter(Volume > cutoffVolume)

# convert scanID and scanDesc columns into factors
xct <- xct %>%
  mutate(scanID = parse_factor(scanID, levels = factorID),
         scanDesc = parse_factor(scanDesc, levels = factorDesc))

# add column for volume per cubic millimeter
xct <- xct %>%
  mutate(vPerCuMm = Volume / 1e9)


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

p.vol.ll <- ggplot(xct) +
  geom_histogram(aes(Volume,fill=scanID,weight=Volume)) +
  facet_grid(scanID ~ .) +
  scale_y_log10() +
  scale_x_log10(limits = c(1,NA)) +
  xlab('inclusion size (cubic micron)') +
  ylab('sum of inclusion volume (cubic micron)') +
  ggtitle('inclusion volume by size')
plot(p.vol.ll)

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

# to-do: print out these tables -----------------
# save plots to files
