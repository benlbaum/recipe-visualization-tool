import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, { 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState,
  addEdge,
  Handle,
  Position,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TextField, Button, Box, Menu, MenuItem } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';

const COLUMN_WIDTH = 300;
const NODE_WIDTH = 200;

const getNearestColumn = (x) => Math.round(x / COLUMN_WIDTH) * COLUMN_WIDTH;

const nodeStyle = {
  width: `${NODE_WIDTH}px`,
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '5px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '50px',
  position: 'relative',
  color: '#333',
  fontWeight: 'bold',
};

const CustomNode = ({ id, data, type }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedLabel, setEditedLabel] = useState(data.label);
    const [contextMenu, setContextMenu] = useState(null);
  
    const handleContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(
        contextMenu === null
          ? { mouseX: event.clientX - 2, mouseY: event.clientY - 4 }
          : null,
      );
    };
  
    const handleClose = () => {
      setContextMenu(null);
    };
  
    const startEditing = () => {
      setIsEditing(true);
      setEditedLabel(data.label);
      handleClose();
    };
  
    const handleBlur = () => {
      setIsEditing(false);
      if (editedLabel !== data.label) {
        data.onEdit(id, editedLabel);
      }
    };
  
    const handleChange = (event) => {
      setEditedLabel(event.target.value);
    };
  
    const NodeContent = () => {
      if (isEditing) {
        return (
          <input
            type="text"
            value={editedLabel}
            onChange={handleChange}
            onBlur={handleBlur}
            autoFocus
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              textAlign: 'center',
              color: 'inherit',
              fontWeight: 'inherit',
            }}
          />
        );
      }
  
      return (
        <>
          {data.label}
          {type === 'ingredient' && <Handle type="source" position={Position.Right} />}
          {type === 'step' && (
            <>
              <Handle type="target" position={Position.Left} />
              <Handle type="source" position={Position.Right} />
            </>
          )}
          {type === 'finalDish' && <Handle type="target" position={Position.Left} />}
        </>
      );
    };
  
    return (
      <div 
        style={{ ...nodeStyle, background: data.background }} 
        onContextMenu={handleContextMenu}
      >
        <NodeContent />
        <Menu
          open={contextMenu !== null}
          onClose={handleClose}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
        >
          <MenuItem onClick={startEditing}>
            <EditIcon fontSize="small" style={{ marginRight: '8px' }} />
            Edit
          </MenuItem>
          <MenuItem onClick={() => { data.onDelete(id); handleClose(); }}>
            <DeleteIcon fontSize="small" style={{ marginRight: '8px' }} />
            Delete
          </MenuItem>
        </Menu>
      </div>
    );
  };

const nodeTypes = {
  ingredient: CustomNode,
  step: CustomNode,
  finalDish: CustomNode,
};

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}) => {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

  return (
    <path
      id={id}
      style={style}
      className="react-flow__edge-path"
      d={edgePath}
    />
  );
};

const edgeTypes = {
  custom: CustomEdge,
};

const RecipeVisualizer = () => {
  const [ingredients, setIngredients] = useState([]);
  const [steps, setSteps] = useState([]);
  const [finalDish, setFinalDish] = useState(null);
  const [newIngredient, setNewIngredient] = useState('');
  const [newStep, setNewStep] = useState({ description: '', time: 0 });
  const [newFinalDish, setNewFinalDish] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const fileInputRef = useRef(null);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'custom', data: { onDelete: deleteEdge } }, eds));
  }, [setEdges]);

  const deleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
  }, [setEdges]);

  const onEditNode = useCallback((nodeId, newLabel) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, label: newLabel } }
          : node
      )
    );
  }, [setNodes]);

  const onDeleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const getNodeData = useCallback((type, label) => {
    return {
      label,
      onEdit: onEditNode,
      onDelete: onDeleteNode,
      background: type === 'ingredient' ? '#F0E68C' : type === 'step' ? '#ADD8E6' : '#90EE90',
    };
  }, [onEditNode, onDeleteNode]);

  const addIngredient = () => {
    if (newIngredient) {
      const newNode = {
        id: `ing-${Date.now()}`,
        type: 'ingredient',
        data: getNodeData('ingredient', newIngredient),
        position: { x: 0, y: ingredients.length * 100 },
      };
      setNodes((nds) => [...nds, newNode]);
      setIngredients([...ingredients, newNode]);
      setNewIngredient('');
    }
  };

  const addStep = () => {
    if (newStep.description && newStep.time) {
      const newNode = {
        id: `step-${Date.now()}`,
        type: 'step',
        data: getNodeData('step', `${newStep.description} (${newStep.time} min)`),
        position: { x: COLUMN_WIDTH, y: steps.length * 100 },
      };
      setNodes((nds) => [...nds, newNode]);
      setSteps([...steps, newNode]);
      setNewStep({ description: '', time: 0 });
    }
  };

  const addFinalDish = () => {
    if (newFinalDish) {
      const newNode = {
        id: 'final-dish',
        type: 'finalDish',
        data: getNodeData('finalDish', newFinalDish),
        position: { x: COLUMN_WIDTH * 2, y: 0 },
      };
      setNodes((nds) => [...nds, newNode]);
      setFinalDish(newNode);
      setNewFinalDish('');
    }
  };

  const onNodeDragStop = (event, node) => {
    const newX = getNearestColumn(node.position.x);
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === node.id) {
          return { ...n, position: { ...n.position, x: newX } };
        }
        return n;
      })
    );
  };

  const exportRecipe = () => {
    const recipeData = {
      nodes,
      edges,
      ingredients,
      steps,
      finalDish
    };
    const dataStr = JSON.stringify(recipeData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'recipe.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importRecipe = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const recipeData = JSON.parse(e.target.result);
          setNodes(recipeData.nodes || []);
          setEdges(recipeData.edges || []);
          setIngredients(recipeData.ingredients || []);
          setSteps(recipeData.steps || []);
          setFinalDish(recipeData.finalDish || null);
        } catch (error) {
          console.error('Error parsing imported file:', error);
          alert('Failed to import recipe. Please check the file format.');
        }
      };

      reader.readAsText(file);
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', gap: 2, p: 2, flexWrap: 'wrap' }}>
        <TextField 
          value={newIngredient}
          onChange={(e) => setNewIngredient(e.target.value)}
          label="Add Ingredient"
        />
        <Button onClick={addIngredient} variant="contained">Add Ingredient</Button>
        
        <TextField 
          value={newStep.description}
          onChange={(e) => setNewStep({...newStep, description: e.target.value})}
          label="Step Description"
        />
        <TextField 
          type="number"
          value={newStep.time}
          onChange={(e) => setNewStep({...newStep, time: parseInt(e.target.value)})}
          label="Time (minutes)"
        />
        <Button onClick={addStep} variant="contained">Add Step</Button>
        
        <TextField 
          value={newFinalDish}
          onChange={(e) => setNewFinalDish(e.target.value)}
          label="Final Dish Name"
        />
        <Button onClick={addFinalDish} variant="contained" disabled={finalDish !== null}>
          Add Final Dish
        </Button>
        
        <Button 
          onClick={exportRecipe} 
          variant="contained" 
          startIcon={<SaveIcon />}
        >
          Export Recipe
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={importRecipe}
          accept=".json"
        />
        <Button 
          onClick={() => fileInputRef.current.click()} 
          variant="contained" 
          startIcon={<UploadIcon />}
        >
          Import Recipe
        </Button>
      </Box>
      
      <Box sx={{ flexGrow: 1, width: '100%' }}>
        <ReactFlow 
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </Box>
    </Box>
  );
};

export default RecipeVisualizer;