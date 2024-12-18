import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, FlatList, Dimensions, StyleSheet, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import DoubleTapView from './DoubleTapView';
import PinchZoomView from './PinchZoomView';
import PdfManager from './PdfManager';
import PdfPageView from './PdfPageView';

// Constants
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * PdfView Component
 * Refactored to a functional component using React hooks.
 */
const PdfView = ({
  filePath,
  scale: defaultScale = 1,
  horizontal = false,
  singlePage = false,
  fitPolicy = 'fitWidth',
  onError = () => {},
  onPageSingleTap = () => {},
  onScaleChanged = () => {},
}) => {
  // States
  const [pdfMetadata, setPdfMetadata] = useState(null); // { pageCount, width, height }
  const [scale, setScale] = useState(defaultScale);
  const [layout, setLayout] = useState({ width: screenWidth, height: screenHeight });

  // Refs
  const scrollRef = useRef(null);
  const pinchZoomRef = useRef(null);

  // Load PDF file metadata
  useEffect(() => {
    const loadPdf = async () => {
      try {
        const metadata = await PdfManager.loadFile(filePath);
        setPdfMetadata(metadata);
      } catch (error) {
        onError(error);
      }
    };
    loadPdf();
  }, [filePath, onError]);

  // Calculate page layout based on fit policy
  const getPageLayout = useCallback(
    (pageWidth, pageHeight) => {
      const containerWidth = layout.width;
      const containerHeight = layout.height;
      let newScale = 1;

      switch (fitPolicy) {
        case 'fitWidth':
          newScale = containerWidth / pageWidth;
          break;
        case 'fitHeight':
          newScale = containerHeight / pageHeight;
          break;
        case 'fitBoth':
          newScale = Math.min(containerWidth / pageWidth, containerHeight / pageHeight);
          break;
        default:
          break;
      }

      return { scale: newScale, width: pageWidth * newScale, height: pageHeight * newScale };
    },
    [layout, fitPolicy]
  );

  const pageLayout = useMemo(() => {
    if (pdfMetadata) {
      return getPageLayout(pdfMetadata.width, pdfMetadata.height);
    }
    return { scale: 1, width: screenWidth, height: screenHeight };
  }, [pdfMetadata, getPageLayout]);

  // Handle zoom scaling
  const handleScaleChange = useCallback(
    (newScale) => {
      const clampedScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
      setScale(clampedScale);
      onScaleChanged(clampedScale);
    },
    [onScaleChanged]
  );

  // Render PDF Page
  const renderPage = useCallback(
    ({ index }) => (
      <PdfPageView
        filePath={filePath}
        page={index + 1}
        scale={scale}
        width={pageLayout.width}
        height={pageLayout.height}
        onSingleTap={() => onPageSingleTap(index + 1)}
      />
    ),
    [filePath, scale, pageLayout, onPageSingleTap]
  );

  if (!pdfMetadata) return null;

  return (
    <View style={styles.container} onLayout={(e) => setLayout(e.nativeEvent.layout)}>
      <PinchZoomView
        ref={pinchZoomRef}
        scale={scale}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        onScaleChange={handleScaleChange}>
        {singlePage ? (
          <DoubleTapView onDoubleTap={() => handleScaleChange(scale * 2)}>
            <ScrollView
              horizontal={horizontal}
              ref={scrollRef}
              contentContainerStyle={{ flexGrow: 1 }}>
              {renderPage({ index: 0 })}
            </ScrollView>
          </DoubleTapView>
        ) : (
          <FlatList
            data={Array.from({ length: pdfMetadata.pageCount }, (_, i) => i)}
            keyExtractor={(item) => item.toString()}
            renderItem={renderPage}
            horizontal={horizontal}
            pagingEnabled
            contentContainerStyle={styles.flatListContainer}
          />
        )}
      </PinchZoomView>
    </View>
  );
};

// PropTypes
PdfView.propTypes = {
  filePath: PropTypes.string.isRequired,
  scale: PropTypes.number,
  horizontal: PropTypes.bool,
  singlePage: PropTypes.bool,
  fitPolicy: PropTypes.oneOf(['fitWidth', 'fitHeight', 'fitBoth']),
  onError: PropTypes.func,
  onPageSingleTap: PropTypes.func,
  onScaleChanged: PropTypes.func,
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flatListContainer: {
    flexGrow: 1,
  },
});

export default PdfView;
